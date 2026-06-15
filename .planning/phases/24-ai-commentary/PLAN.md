# Phase 24 — 단지별 AI 코멘트 배치

## Goal

`complex_price_predictions.ai_commentary` 컬럼을 채우는 월간 배치를 구현하고,
투자 랭킹 카드에 코멘트를 표시한다.

**성공 기준:**
- 예측 레코드가 있는 전체 단지의 ai_commentary 90% 이상 채워짐
- 투자 랭킹 카드에서 코멘트 1줄 표시
- 배치 스크립트 dry-run / 실 실행 모두 동작
- GitHub Actions 월 1회 자동 실행 (`*/1 * * * *` → `0 20 1 * *`)

---

## Enrichment 설계

지역 commentary (`regional-commentary.ts`)는 시군구 전체를 3~4문장으로 분석한다.
단지 commentary는 **"왜 이 단지가 랭킹에 오른 것인가"** 를 2문장으로 답한다.

### 입력 데이터 티어

| 티어 | 필드 | 출처 | 설명 |
|------|------|------|------|
| T1 | `change_pct`, `near_price`, `far_price` | `complex_price_predictions` | 예측 핵심값 |
| T1 | `avg_mape`, `model_name`, `training_count` | 동일 | 모델 신뢰도 |
| T2 | `jeonse_ratio`, `gap_amount`, `risk_level` | `complex_gap_stats` | 갭 투자 리스크 |
| T2 | `price_change_30d`, `tx_count_30d` | `complexes` | 최근 시장 온도 |
| T2 | `avg_sale_per_pyeong` | `complexes` | 평당 가격 |
| T3 | `built_year`, `household_count` | `complexes` | 단지 특성 |
| T4 | `primary_school_name`, `students_per_class` | `facility_school` + school quality | 학군 신호 |
| T4 | `hagwon_score` | `complexes` (계산 컬럼) | 학원 밀집도 |
| T4 | `management_cost_m2` | `facility_kapt` | 관리비 |

### 프롬프트 설계

```
당신은 단지별 아파트 시장 분석 전문가입니다.
아래 데이터를 바탕으로 [단지명] 아파트 ([면적]㎡)를 2문장으로 분석하세요.

## 예측
- 6개월 예측 변화율: {change_pct}% ({model_name}, MAPE {avg_mape*100:.1f}%, 학습 {training_count}개월)
- 현재→예측: {near_price}만원 → {far_price}만원

## 시장 신호
- 전세가율: {jeonse_ratio}% (갭 위험도: {risk_level})
- 최근 30일: 거래 {tx_count_30d}건, 가격 {price_change_30d:+.1f}%
- 평당 매매가: {avg_sale_per_pyeong}만원

## 단지 특성
- 건축: {built_year}년 ({age}년), {household_count}세대
- 관리비: {management_cost_m2}원/㎡

## 학군
- 배정 초등: {primary_school_name} (학급당 {students_per_class}명)
- 학원 점수: {hagwon_score}

작성 지침:
- 수치를 직접 인용하세요.
- 예측 방향 근거가 되는 가장 두드러진 요소 1~2가지를 선택하세요.
- 주목할 리스크(전세가율·노후도·거래 희소) 또는 강점(대단지·학군·신축)을 1가지 언급하세요.
- 투자 권유 금지. 2문장, 한국어.
```

---

## 구현 태스크

### 24-01: SQL RPC — commentary 입력 배치 조회 (DB)

**파일:** `supabase/migrations/20260612000001_complex_commentary_inputs_rpc.sql`

```sql
CREATE OR REPLACE FUNCTION public.get_complex_commentary_inputs(
  p_area_bucket text DEFAULT '84',
  p_stale_days  int  DEFAULT 35,   -- ai_cached_at이 이 일수보다 오래됐거나 NULL인 것만
  p_limit       int  DEFAULT 200,
  p_offset      int  DEFAULT 0
)
RETURNS TABLE (
  complex_id          uuid,
  area_bucket         text,
  complex_name        text,
  si                  text,
  gu                  text,
  built_year          int,
  household_count     int,
  change_pct          numeric,
  near_price          int,
  far_price           int,
  avg_mape            real,
  model_name          text,
  training_count      int,
  jeonse_ratio        numeric,
  gap_amount          int,
  gap_risk_level      text,
  price_change_30d    numeric,
  tx_count_30d        int,
  avg_sale_per_pyeong numeric,
  hagwon_score        int,
  management_cost_m2  numeric,
  primary_school_name text,
  students_per_class  numeric
)
```

- `complex_price_predictions` 기준
- LEFT JOIN `complexes`, `complex_gap_stats`, `facility_kapt`
- 배정 초등학교: `facility_school` where `school_type='elementary' AND is_assignment=true` LIMIT 1
- school quality: `school_code` → `school_quality_stats` `students_per_class`
- 조건: `ai_commentary IS NULL OR ai_cached_at < NOW() - (p_stale_days || ' days')::interval`
- 정렬: `change_pct DESC` (높은 것부터 처리)

### 24-02: 배치 스크립트

**파일:** `scripts/generate-complex-commentary.ts`

```
CLI flags:
  --area-bucket=84     (default: 84)
  --limit=200          (default: 200, 0=전체)
  --dry-run            프롬프트 출력만, DB 저장 안 함
  --verbose            각 단지 코멘트 콘솔 출력
```

**흐름:**
1. `get_complex_commentary_inputs` RPC 호출 (페이지네이션 100건씩)
2. 각 레코드를 프롬프트 빌더에 통과
3. Gemini 2.0 Flash 호출 (concurrency 5, 200ms interval)
4. `UPDATE complex_price_predictions SET ai_commentary=$1, ai_cached_at=NOW() WHERE complex_id=$2 AND area_bucket=$3`
5. 결과 요약: 성공 N / 실패 N / 건너뜀 N

**환경변수:** `.env.local` — `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**실행:**
```bash
npx tsx --env-file=.env.local scripts/generate-complex-commentary.ts --dry-run
npx tsx --env-file=.env.local scripts/generate-complex-commentary.ts --limit=50
```

### 24-03: 투자 랭킹 UI 코멘트 표시

**파악 필요:** `src/app/invest/` 하위에서 `aiCommentary` 렌더 위치 확인 후 구현.

이미 `getTopPredictionComplexes()` → `aiCommentary: r.ai_commentary` 매핑됨.
UI에 표시만 추가하면 됨.

**표시 형태:**
```
┌─────────────────────────────────────────────────────┐
│  용지더샹레이크파크  84㎡   +8.3%  ↑               │
│  ···                                                  │
│  "전세가율 72%로 안정적, 30일 거래 4건 회복세.      │
│   대단지(1,264세대) 유동성 강점, MAPE 8.6%."        │
└─────────────────────────────────────────────────────┘
```

- 스타일: `text-xs text-muted-foreground`, 최대 2줄 (`line-clamp-2`)
- `null`이면 렌더 안 함 (점진 채워지는 구조)

### 24-04: GitHub Actions 월간 스케줄

**파일:** `.github/workflows/monthly-ai-commentary.yml`

```yaml
on:
  schedule:
    - cron: '0 20 1 * *'   # 매월 1일 05:00 KST
  workflow_dispatch:         # 수동 실행

env:
  GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

- Node.js 20
- `npx tsx scripts/generate-complex-commentary.ts --limit=0` (전체)
- 실행 결과 로그 아티팩트 업로드

### 24-05: 테스트

**파일:** `src/lib/ai/__tests__/complex-commentary.test.ts`

- 프롬프트 빌더: null 필드 처리 (`—` 대체)
- 프롬프트 빌더: built_year → age 계산 정확성
- 프롬프트 빌더: risk_level 한국어 매핑 (safe→안전, caution→주의, danger→위험)
- Gemini 응답 파싱: 앞뒤 공백 trim
- 빈 응답 처리: `''` → skip (DB 업데이트 안 함)

---

## 비용 예측

| 구분 | 수치 |
|------|------|
| 예측 단지 수 | ~400 단지 × 1 bucket = ~400 건 |
| 프롬프트 길이 | ~600 tokens input + ~150 tokens output |
| 월 1회 총 tokens | ~300,000 tokens |
| Gemini 2.0 Flash 비용 | ~$0.06 / 월 (≈ 90원) |
| 연간 | ~$0.72 (≈ 1,080원) |

Gemini cap(5,000원) 내 안전.

---

## 실행 순서

```
24-01 → 24-02 → 24-05 → 수동 배치 실행(--dry-run 확인) → 24-03 → 24-04
```

DB RPC가 먼저 있어야 스크립트 개발 가능.
UI(24-03)는 DB에 실제 데이터가 채워진 후 확인.

---

## 완료 체크리스트

- [ ] 24-01: RPC migration 적용 (`supabase db push`)
- [ ] 24-02: 스크립트 dry-run 성공
- [ ] 24-02: 실 실행 50건 테스트 성공
- [ ] 24-05: 테스트 통과
- [ ] 24-03: 랭킹 카드 코멘트 표시 확인 (로컬)
- [ ] 24-04: workflow_dispatch 수동 실행 성공
- [ ] 전체 단지 배치 실행 완료 (100% 커버리지 확인)
