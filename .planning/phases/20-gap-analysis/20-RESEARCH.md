# Phase 20: 갭투자 분석 — Research

**Researched:** 2026-05-28
**Domain:** 한국 갭투자 분석 / Supabase SQL 집계 / Next.js 15 RSC
**Confidence:** HIGH (기존 코드 패턴) / MEDIUM (위험도 기준 수치)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: 노출 위치**
- 단지 상세 (`/complexes/[id]`): 갭투자 요약 카드
- 전용 페이지 (`/gap-analysis`): 창원·김해 전체 단지 갭 비율 랭킹 테이블

**D-02: 위험도 표현**
- 숫자: 갭 금액(억/만원), 갭 비율(%), 전세가율(%)
- 신호등 배지 (CSS dot, 이모지 X):
  - 안전: 갭 비율 40% 미만 (전세가율 60% 이상)
  - 주의: 갭 비율 40~60% (전세가율 40~60%)
  - 위험: 갭 비율 60% 초과 (전세가율 40% 미만)
- 이모지 아이콘 금지 — SVG path 또는 CSS dot

**D-03: 데이터 소스**
- `transactions` 테이블, `deal_type = 'sale'` / `deal_type = 'jeonse'`
- 같은 `complex_id` 내 최근 거래로 갭 산출
- 기간: 최근 12개월 중위값 (연구 후 결정 → 12개월 확정, 아래 근거 참조)

**D-04: 계산 방식**
```
갭 금액 = 매매가 중위값 − 전세보증금 중위값
갭 비율 = 갭 금액 / 매매가 중위값 × 100
전세가율 = 전세보증금 중위값 / 매매가 중위값 × 100
```
- 단위: 단지별 (`complex_id`)
- 면적 구간별 세분화는 Deferred
- 데이터 부족 (거래 건수 < 3) → 표시 불가 처리

**D-05: DB 캐시 전략**
- `complex_gap_stats` 테이블에 캐시 (materialized view X)
- 일배치 cron(`daily-batch`)에 갭 통계 재계산 추가

**D-06: UI 원칙**
- AI 슬롭 금지 (CLAUDE.md): backdrop-blur, gradient-text, glow, 보라/인디고, gradient orb 없음
- 데이터 없는 단지: 갭투자 섹션 숨김

### Claude's Discretion
- 면적 구간별 갭 분석: Deferred — 단지 전체 중위값만 Phase 20에서 구현
- 계산 시 최소 거래 건수 임계값: 연구 후 결정 (아래 "최소 데이터 임계값" 섹션 참조)

### Deferred Ideas (OUT OF SCOPE)
- 면적 구간별 갭 분석 (59㎡, 84㎡ 등)
- 시계열 갭 추이 그래프
- 전세가율 히스토리 월별 변화
- 지도 오버레이 (갭 비율 히트맵)
- 알림 기능 (갭 비율 변화 push notification)
- 전세 역전 경보
</user_constraints>

---

## Summary

갭투자 분석은 `매매가 중위값 − 전세보증금 중위값 = 갭 금액` 계산을 핵심으로 한다. 이 프로젝트는 이미 `transactions` 테이블에 `deal_type = 'sale'` (매매)과 `deal_type = 'jeonse'` (전세) 거래를 모두 보유하고 있으므로 외부 API 추가 없이 구현 가능하다.

핵심 과제는 같은 단지(complex_id)의 매매/전세 거래가 각각 다른 시점·호수에서 발생하므로, 이를 단지 전체 집계값(중위값)으로 통합하는 것이다. Supabase(PostgreSQL)의 `PERCENTILE_CONT(0.5)` 함수 또는 JavaScript-side 정렬로 중위값을 계산하고, 결과를 `complex_gap_stats` 테이블에 캐시해 단지 상세 페이지와 랭킹 페이지가 조회한다.

기존 `rankings.ts` + `/api/cron/rankings/route.ts` + `/api/cron/daily/route.ts` 패턴이 완전히 재사용 가능하다. 새로 만들 파일은 `src/lib/data/gap-stats.ts` (집계 함수) + `src/app/api/cron/gap-stats/route.ts` (독립 cron 또는 daily 내 호출) + 마이그레이션 SQL + 2개 UI 컴포넌트이다.

**Primary recommendation:** `complex_gap_stats` 테이블(regular table, not materialized view)에 일배치로 UPSERT. 단지 상세는 이 테이블 단순 조회. `/gap-analysis` 페이지는 `complex_gap_stats JOIN complexes` 쿼리로 랭킹 테이블 렌더링.

---

## 중요 발견: 기존 deal_type 값

**CRITICAL:** `realprice.ts` 및 `transactions` 스키마를 직접 확인한 결과, `deal_type` enum은 `'sale' | 'jeonse' | 'monthly'` 이다. 태스크 설명의 `'trade'` / `'lease'` 는 오기이다.

- 매매가 집계: `deal_type = 'sale'`
- 전세보증금 집계: `deal_type = 'jeonse'` (월세 제외 — `deal_type = 'monthly'`는 보증금+월세이므로 갭투자 계산에서 제외)

[VERIFIED: `supabase/migrations/20260430000003_transactions.sql` + `src/lib/data/realprice.ts`]

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 갭 통계 집계 계산 | DB / Storage (SQL 또는 JS 집계) | API/Backend | 대량 거래 데이터 집계는 DB RPC가 효율적 |
| 갭 통계 캐시 저장 | DB / Storage (`complex_gap_stats`) | — | 일배치 UPSERT, 실시간 계산 X |
| 단지 상세 갭 카드 | Frontend Server (RSC) | — | `createReadonlyClient()`로 직접 조회, 클라이언트 X |
| 갭 랭킹 페이지 | Frontend Server (RSC) | — | 페이지 전체 서버 렌더링 (ISR revalidate=3600) |
| 위험도 배지 로직 | Frontend Server (RSC) | — | 순수 계산, 클라이언트 상태 불필요 |
| 일배치 재계산 | API / Backend (cron route) | — | `/api/cron/daily` 또는 신규 `/api/cron/gap-stats` |

---

## 1. 갭투자 메커니즘

### 정의 및 공식

[CITED: Wikipedia 갭 투자 / 나무위키 갭 투자]
[VERIFIED: 한국 부동산 업계 공통 정의]

```
갭 금액  = 매매가 중위값 − 전세보증금 중위값   (만원 단위)
갭 비율  = 갭 금액 / 매매가 중위값 × 100       (%)
전세가율 = 전세보증금 중위값 / 매매가 중위값 × 100  (%)
         = 100 − 갭 비율
```

**개념:** 갭투자는 "전세 세입자가 내는 보증금으로 대부분의 매수 자금을 조달해 소액만으로 아파트를 매입하는 투자 방식"이다. 갭이 작을수록 투자자의 자기 자금 부담이 적다.

**계산 예시:**
- 매매가 중위값: 3억 5,000만원
- 전세보증금 중위값: 2억 2,000만원
- 갭 금액: 1억 3,000만원
- 갭 비율: 1억 3,000 / 3억 5,000 × 100 = 37.1% → 안전
- 전세가율: 62.9%

### 역전세(逆傳貰) 위험

전세 계약 만기 시 새 세입자가 기존보다 낮은 보증금을 요구하거나 세입자를 구하지 못할 때 투자자가 차액을 자력으로 돌려줘야 하는 상황. 전세가율이 높을수록 역전세 가능성도 높다.

---

## 2. 위험도 기준

### 업계 기준

[CITED: marketingstorylab.com 전세가율과 갭투자 / zippoom.com 깡통전세 판별 / 부동산R114 공식 입장]
[MEDIUM confidence — 법정 기준이 아닌 업계 관행]

| 전세가율 | 갭 비율 | 위험도 | 설명 |
|----------|---------|--------|------|
| 60% 미만 | 40% 초과 | 안전 | 서울·경기 주요지역 수준; 보증금 회수 위험 낮음 |
| 60~80% | 20~40% | 주의 | 일반적 지방 중소도시 수준; 가격 하락 시 주의 필요 |
| 80% 이상 | 20% 미만 | 위험 | 부동산R114 기준 "깡통전세 위험"; 역전세 가능성 높음 |
| 90% 이상 | 10% 미만 | 극위험 | 일부 지방 소도시; 매도도 어려운 수준 |

**중요:** D-02 결정에서 사용자는 이미 위험도 구간을 확정했다:
- 안전: 갭 비율 40% 미만 (전세가율 60% 이상)  
- 주의: 갭 비율 40~60% (전세가율 40~60%)  
- 위험: 갭 비율 60% 초과 (전세가율 40% 미만)

**창원·김해 지역 맥락 [ASSUMED]:** 지방 중소도시 기준으로 전세가율은 수도권보다 높은 편. 창원은 대형 제조업 도시로 실수요가 존재하나, 최근 부동산 침체로 전세가율이 70~80% 구간인 단지가 많을 것으로 예상된다. 실제 데이터를 쿼리해 분포를 확인 후 배지 구간 적절성을 검증하는 것이 권장된다.

---

## 3. 데이터 집계 전략

### 핵심 과제: 매매/전세 거래 매칭

같은 단지에서 매매와 전세는 **다른 날짜, 다른 층, 다른 면적**에서 발생한다. 이를 직접 1:1 매칭하는 것은 불가능하므로, 업계 표준은 **단지 전체 기간 집계(중위값)** 방식을 사용한다.

[CITED: 호갱노노 / 아실 / 아파트미(apt2.me) 분석 방식 관찰]

**권장 집계 전략:**

```sql
-- 단지별 갭 통계 집계 (PostgreSQL PERCENTILE_CONT)
WITH
sale_stats AS (
  SELECT
    complex_id,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS median_sale_price,
    COUNT(*) AS sale_count
  FROM transactions
  WHERE
    deal_type = 'sale'
    AND deal_date >= CURRENT_DATE - INTERVAL '12 months'
    AND cancel_date IS NULL
    AND superseded_by IS NULL
    AND complex_id IS NOT NULL
    AND price IS NOT NULL
  GROUP BY complex_id
),
jeonse_stats AS (
  SELECT
    complex_id,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS median_jeonse_price,
    COUNT(*) AS jeonse_count
  FROM transactions
  WHERE
    deal_type = 'jeonse'
    AND deal_date >= CURRENT_DATE - INTERVAL '12 months'
    AND cancel_date IS NULL
    AND superseded_by IS NULL
    AND complex_id IS NOT NULL
    AND price IS NOT NULL
  GROUP BY complex_id
)
SELECT
  s.complex_id,
  s.median_sale_price,
  j.median_jeonse_price,
  s.median_sale_price - j.median_jeonse_price AS gap_amount,
  ROUND((1 - j.median_jeonse_price / s.median_sale_price) * 100, 1) AS gap_ratio,
  ROUND((j.median_jeonse_price / s.median_sale_price) * 100, 1) AS jeonse_ratio,
  s.sale_count,
  j.jeonse_count
FROM sale_stats s
JOIN jeonse_stats j ON s.complex_id = j.complex_id
WHERE s.sale_count >= 3 AND j.jeonse_count >= 3;
```

[VERIFIED: PostgreSQL PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY col) — 중위값 계산 표준 함수]
[CITED: leafo.net/guides/postgresql-calculating-percentile]

### 시간 윈도우 결정: 12개월

| 옵션 | 장점 | 단점 |
|------|------|------|
| 3개월 | 최신 시세 반영, 빠른 반응 | 거래 희박 단지에서 데이터 부족 |
| 6개월 | 균형 | — |
| **12개월** | 계절 효과 평탄화, 데이터 충분 | 시세 변화 지연 반영 |
| 24개월 | 더 안정적 | 과거 시세가 현재 분석을 오염 |

**결론: 12개월 채택** — D-03에서 사용자가 선호 표시. 창원·김해 같은 지방 중소도시는 월별 거래량이 적으므로 12개월이 통계적으로 안정적이다.

### 최소 데이터 임계값

D-04에서 `< 3` 거래 시 표시 불가로 결정됨. **매매 ≥ 3건 AND 전세 ≥ 3건**을 동시 충족해야 갭 통계를 저장한다.

**근거:** 3건 미만 중위값은 이상치에 너무 민감하다. 3건 이상이면 중간값이 극단값의 영향을 줄인다.

**실무 영향:** 일부 소규모 단지나 빌라(연립다세대)는 제외된다. 이는 정보 제공의 정확성을 위한 의도적 선택이다.

### JavaScript-side vs SQL RPC 선택

| 방법 | 장점 | 단점 |
|------|------|------|
| SQL RPC (`PERCENTILE_CONT`) | DB에서 처리, 네트워크 절감 | `supabase.rpc()` 호출, 마이그레이션에 함수 정의 필요 |
| JavaScript-side 정렬 | 기존 패턴과 일치 (`rankings.ts`처럼) | 대량 행 전송 필요 (창원·김해 전체 12개월 거래 수천 건) |

**결론: SQL RPC 권장.** 창원·김해 6개 sgg_code × 12개월 × 매매+전세를 JS로 가져오면 수천~수만 행. DB에서 집계하는 것이 훨씬 효율적. 기존 `refresh_complex_price_stats` RPC 패턴이 이미 존재한다 (`daily/route.ts` 43번째 줄).

---

## 4. DB 설계

### 테이블 선택: Materialized View vs Regular Table

[CITED: supabase.com/docs — materialized view API 노출 제한, RLS 적용 불가]
[VERIFIED: 기존 `complex_rankings` 테이블 주석: "materialized view 대신 테이블 사용 이유: RLS 적용 가능, 서비스롤 UPSERT 안정"]

**결론: Regular table** (기존 `complex_rankings` 패턴 그대로 따름).

### 제안 스키마: `complex_gap_stats`

```sql
-- Migration: 20260528xxxxxx_complex_gap_stats.sql
CREATE TABLE public.complex_gap_stats (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id            uuid NOT NULL REFERENCES public.complexes(id) ON DELETE CASCADE,

  -- 집계 결과 (만원 단위)
  median_sale_price     bigint NOT NULL,        -- 매매가 중위값 (만원)
  median_jeonse_price   bigint NOT NULL,        -- 전세보증금 중위값 (만원)
  gap_amount            bigint NOT NULL,        -- 갭 금액 = 매매가 - 전세가 (만원)
  gap_ratio             numeric(5, 1) NOT NULL, -- 갭 비율 % (소수 1자리)
  jeonse_ratio          numeric(5, 1) NOT NULL, -- 전세가율 % (= 100 - gap_ratio)

  -- 위험도 배지
  risk_level            text NOT NULL CHECK (risk_level IN ('safe', 'caution', 'danger')),

  -- 집계 근거 메타데이터
  sale_count            integer NOT NULL,       -- 매매 거래 건수 (12개월)
  jeonse_count          integer NOT NULL,       -- 전세 거래 건수 (12개월)
  window_months         integer NOT NULL DEFAULT 12,

  -- 타임스탬프
  computed_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (complex_id)  -- 단지당 1행
);

-- 인덱스 1: 갭 비율 높은 순 랭킹 페이지용
CREATE INDEX complex_gap_stats_gap_ratio_idx
  ON public.complex_gap_stats (gap_ratio DESC);

-- 인덱스 2: 위험도별 필터링
CREATE INDEX complex_gap_stats_risk_level_idx
  ON public.complex_gap_stats (risk_level);

-- 인덱스 3: complex_id (FK 조회 최적화)
CREATE INDEX complex_gap_stats_complex_id_idx
  ON public.complex_gap_stats (complex_id);

COMMENT ON TABLE public.complex_gap_stats IS
  '단지별 갭투자 통계 캐시. daily-batch cron이 12개월 중위값으로 일 1회 UPSERT.';
```

**컬럼 설계 근거:**
- `risk_level`을 테이블에 저장하는 이유: 랭킹 페이지에서 `WHERE risk_level = 'danger'` 필터를 DB에서 처리하기 위해. 매번 JS에서 재계산하는 것보다 효율적.
- `UNIQUE (complex_id)`: 단지당 하나의 최신 통계만 유지. UPSERT `onConflict: 'complex_id'`.
- `gap_ratio` / `jeonse_ratio`: `100 − gap_ratio = jeonse_ratio`이므로 하나만 저장해도 되지만, 양쪽 모두 UI에서 직접 쓰므로 둘 다 저장.

### RLS 정책

```sql
-- 갭투자 통계는 공개 정보 (누구나 읽기 가능)
ALTER TABLE public.complex_gap_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gap_stats_public_read"
  ON public.complex_gap_stats FOR SELECT
  USING (true);
```

### data_sources 등록

```sql
INSERT INTO data_sources (id, cadence, expected_freshness_hours, ui_label)
VALUES ('gap-stats', 'daily', 28, '갭투자 통계 (일배치 재계산)')
ON CONFLICT (id) DO NOTHING;
```

---

## 5. 집계 함수 구현 패턴

`src/lib/data/gap-stats.ts` — `rankings.ts` 패턴 준용.

```typescript
// Source: 기존 rankings.ts 집계 패턴 준용
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const WINDOW_MONTHS = 12
const MIN_TRADE_COUNT = 3  // 매매·전세 각각 최소

export type RiskLevel = 'safe' | 'caution' | 'danger'

export function computeRiskLevel(gapRatio: number): RiskLevel {
  if (gapRatio < 40) return 'safe'
  if (gapRatio <= 60) return 'caution'
  return 'danger'
}

export interface GapStatsRow {
  complexId: string
  medianSalePrice: number
  medianJeonsePrice: number
  gapAmount: number
  gapRatio: number
  jeonseRatio: number
  riskLevel: RiskLevel
  saleCount: number
  jeonseCount: number
}
```

**집계 구현 옵션:**

**옵션 A — SQL RPC (권장):** Supabase DB 함수로 전체 집계를 실행 후 결과만 받기.
```typescript
const { data } = await supabase.rpc('compute_gap_stats', { p_window_months: WINDOW_MONTHS })
```

**옵션 B — JS-side (단순하지만 비효율):** `transactions`를 bulk 조회 후 JS에서 정렬·중위값 계산.

**추천:** Supabase RPC 함수 작성. 이유: 창원·김해 전체 12개월 거래 행은 수만 건 규모로 예상. JS-side 전송 비용이 크고, `PERCENTILE_CONT`가 정확한 중위값을 보장한다.

---

## 6. 면적 구간 분석

**Phase 20 범위:** 단지 전체 중위값만 (면적 구분 없음). [LOCKED by D-04]

**Deferred 구현 시 고려사항 (미래 참고용):**

면적 구간은 `ROUND(area_m2 / 3.3058) * 3.3058` 로 반올림 후 그룹핑하거나, `CASE` 표현식으로 59㎡형(전용 59㎡ 근방) / 84㎡형(전용 84㎡ 근방)으로 분류한다.

```sql
-- 면적 구간 분류 예시 (향후 구현 참고)
CASE
  WHEN area_m2 BETWEEN 55 AND 65 THEN '59형'
  WHEN area_m2 BETWEEN 79 AND 90 THEN '84형'
  ELSE '기타'
END AS area_type
```

이 경우 `complex_gap_stats`에 `area_type` 컬럼을 추가하고 `UNIQUE (complex_id, area_type)`으로 변경해야 한다.

---

## 7. UI 패턴

### 단지 상세 갭투자 카드

**위치:** `/complexes/[id]/page.tsx` 기존 카드 섹션 추가. 기존 card 스타일 (`className="card"`, `padding: 20`) 준용.

**렌더링:** 서버 컴포넌트에서 `complex_gap_stats` 테이블 조회 → 결과 없으면 섹션 전체 숨김.

```tsx
// src/components/complex/GapAnalysisCard.tsx
// 데이터 없으면 null 반환 (숨김 처리)
interface GapAnalysisCardProps {
  gapAmount: number       // 만원
  gapRatio: number        // % (소수 1자리)
  jeonseRatio: number     // % (소수 1자리)
  riskLevel: 'safe' | 'caution' | 'danger'
  saleCount: number
  jeonseCount: number
}
```

**위험도 배지 CSS (이모지 금지):**
```css
/* D-02 확정 색상 */
.badge-safe    { background: #16a34a; color: #fff; }  /* 안전 */
.badge-caution { background: #d97706; color: #fff; }  /* 주의 */
.badge-danger  { background: #dc2626; color: #fff; }  /* 위험 */
```

**표시 숫자 포맷:**
- 갭 금액: `formatPrice()` 사용 (기존 `복잡상세 페이지` `formatPrice` 함수 — 억/만원 단위) [VERIFIED: 페이지 내 `formatPrice` 함수 존재 확인]
- 갭 비율: `gapRatio.toFixed(1) + '%'`
- 전세가율: `jeonseRatio.toFixed(1) + '%'`

**카드 레이아웃 스케치 (CONTEXT.md D-06 스케치 기반):**
```
┌─────────────────────────────────────────────┐
│  갭투자 분석              [주의 dot+텍스트]  │
├─────────────────────────────────────────────┤
│  갭 금액       갭 비율     전세가율          │
│  1억 2,500만   52.1%       47.9%            │
│                                             │
│  기준: 최근 12개월 거래 중위값              │
│  매매 N건 / 전세 N건 분석                  │
└─────────────────────────────────────────────┘
```

### 갭 랭킹 페이지 (`/gap-analysis`)

**쿼리:** `complex_gap_stats JOIN complexes` — `gap_ratio DESC` 정렬, sgg_code 필터 선택.

**컬럼 구성:**
| # | 단지명 | 갭 비율 | 갭 금액 | 전세가율 | 위험도 | 매매 N건 |
|---|--------|---------|---------|---------|--------|---------|

**기존 테이블 스타일 준용:** `card + overflow:hidden + borderCollapse` (admin 페이지 패턴).

**필터:** sgg_code 기반 지역 필터 (창원 vs 김해), 위험도 필터.

**ISR:** `export const revalidate = 3600` (1시간) — 일배치 cron 이후 자동 갱신.

---

## 8. 위험 요소 및 함정

### Pitfall 1: deal_type 오기 (CRITICAL)

**문제:** 문서/태스크 설명에서 `'trade'` / `'lease'`로 표기되는 경우가 있으나, 실제 enum은 `'sale'` / `'jeonse'` / `'monthly'`.

**예방:** 항상 `realprice.ts`와 마이그레이션 SQL을 실제 참조값으로 사용.

### Pitfall 2: cancel_date / superseded_by 필터 누락 (CRITICAL)

**CLAUDE.md 필수 규칙:** 모든 거래 쿼리에 `WHERE cancel_date IS NULL AND superseded_by IS NULL` 포함.

**SQL에서:**
```sql
AND cancel_date IS NULL
AND superseded_by IS NULL
```

### Pitfall 3: 월세(monthly) 거래를 전세 집계에 포함

**문제:** `deal_type = 'monthly'`는 월세+보증금 형태로, `price` 컬럼이 보증금만 담아 전세 보증금과 다르다.

**예방:** `deal_type = 'jeonse'`만 필터링. `monthly` 절대 포함 금지.

### Pitfall 4: 데이터 희박 단지의 왜곡된 중위값

**문제:** 거래 2건이면 단순 평균이 중위값 = (max + min) / 2가 되어 이상치에 취약.

**예방:** `sale_count >= 3 AND jeonse_count >= 3` 조건으로 필터링 후 저장. 이보다 적은 단지는 `complex_gap_stats`에 행 자체가 없으므로 UI에서 섹션 숨김 처리가 자동으로 적용됨.

### Pitfall 5: `PERCENTILE_CONT`를 Window Function으로 사용 시도

**문제:** `PERCENTILE_CONT`는 ordered-set aggregate이므로 `OVER()` 절과 함께 사용 불가. `WITHIN GROUP (ORDER BY col)` 구문만 사용 가능.

**예방:**
```sql
-- 올바른 사용
PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)
-- 틀린 사용 (오류 발생)
PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) OVER (PARTITION BY complex_id)
```

### Pitfall 6: `complex_id IS NULL` 거래

**문제:** 아직 단지 매칭이 완료되지 않은 거래(`complex_id IS NULL`)를 포함하면 잘못된 집계.

**예방:** `AND complex_id IS NOT NULL` 조건 포함 (기존 `rankings.ts`와 동일).

### Pitfall 7: UPSERT conflict target

**문제:** `UNIQUE (complex_id)`가 없으면 INSERT 후 중복 행 발생.

**예방:** 마이그레이션에 `UNIQUE (complex_id)` 포함. UPSERT 시 `onConflict: 'complex_id'`.

---

## 9. Don't Hand-Roll

| 문제 | 직접 구현 금지 | 사용할 것 | 이유 |
|------|-------------|----------|------|
| 중위값 계산 | 직접 정렬 함수 | `PERCENTILE_CONT(0.5)` (SQL) | 대량 데이터에서 효율적, 정확 |
| 가격 포맷 | 새 포맷 함수 | 기존 `formatPrice()` (complex detail page) | 이미 구현된 억/만원 포맷 |
| 배치 패턴 | 새 orchestration | 기존 `rankings.ts` + cron route 패턴 | 이미 테스트·검증된 구조 |
| 위험도 계산 | 복잡한 로직 | 단순 threshold 비교 | 3개 구간 if/else로 충분 |

---

## 10. 구현 순서 (Wave 구조)

### Wave 0 — DB 마이그레이션

1. `complex_gap_stats` 테이블 생성 마이그레이션
2. `compute_gap_stats` SQL RPC 함수 작성 (PERCENTILE_CONT 집계)
3. `data_sources`에 `gap-stats` 행 추가
4. RLS 정책 (`public read`)

### Wave 1 — 집계 로직 + Cron

5. `src/lib/data/gap-stats.ts` — `computeGapStats()` 함수 (Supabase RPC 호출 + UPSERT)
6. `src/app/api/cron/gap-stats/route.ts` — 독립 cron 엔드포인트 (CRON_SECRET 검증 포함)
7. `vercel.json`에 cron 스케줄 추가 (`"0 20 * * *"` — daily 이후)
8. 단위 테스트: `src/__tests__/gap-stats.test.ts` (rankings.test.ts 패턴 준용)

### Wave 2 — 단지 상세 UI

9. `src/lib/data/gap-analysis.ts` — `getComplexGapStats(complexId, supabase)` 읽기 함수
10. `src/components/complex/GapAnalysisCard.tsx` — 갭투자 카드 컴포넌트 (RSC)
11. `src/app/complexes/[id]/page.tsx` — 갭 카드 통합 (Promise.all 추가)
12. 컴포넌트 단위 테스트

### Wave 3 — 갭 랭킹 페이지

13. `src/app/gap-analysis/page.tsx` — RSC, `revalidate = 3600`
14. `src/lib/data/gap-analysis.ts` — `getGapRankings(filter, supabase)` 함수 추가
15. 필터 컴포넌트 (지역, 위험도) — URL searchParams 기반 (클라이언트 상태 X)
16. E2E 스모크 테스트

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (vitest.config.ts 확인) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test -- gap` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File |
|-----|----------|-----------|-------------------|------|
| GAP-01 | `computeRiskLevel()`가 구간별로 올바른 risk_level 반환 | unit | `npm run test -- gap-stats` | Wave 0 |
| GAP-02 | 거래 < 3건 단지는 갭 통계가 저장되지 않음 | unit (mock) | `npm run test -- gap-stats` | Wave 0 |
| GAP-03 | `deal_type = 'monthly'`가 집계에서 제외됨 | unit (mock) | `npm run test -- gap-stats` | Wave 0 |
| GAP-04 | cron 엔드포인트가 CRON_SECRET 없으면 401 반환 | unit | `npm run test -- gap-stats` | Wave 1 |
| GAP-05 | cron 정상 실행 시 200 + ok:true | unit (mock) | `npm run test -- gap-stats` | Wave 1 |
| GAP-06 | `getComplexGapStats()` — 데이터 없는 단지 null 반환 | unit | `npm run test -- gap-analysis` | Wave 2 |
| GAP-07 | 갭 카드 — 데이터 없으면 렌더 결과 null | unit | `npm run test -- GapAnalysisCard` | Wave 2 |
| GAP-08 | `/gap-analysis` 페이지 — HTML 200 반환 | e2e smoke | Playwright | Wave 3 |

### Wave 0 Test Gaps

- [ ] `src/__tests__/gap-stats.test.ts` — GAP-01 ~ GAP-05 커버
- [ ] `src/__tests__/gap-analysis.test.ts` — GAP-06 ~ GAP-07 커버
- [ ] 기존 mock 패턴: `rankings.test.ts`의 `makeMockChain` / `makeMockSupabase` 헬퍼 재사용 가능

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | 아니오 | — |
| V3 Session Management | 아니오 | — |
| V4 Access Control | 예 (cron 엔드포인트) | `CRON_SECRET` Bearer 토큰 검증 (기존 패턴) |
| V5 Input Validation | 예 (URL 파라미터) | `searchParams` 타입 체크 + allowlist 필터 |
| V6 Cryptography | 아니오 | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized cron 호출 | Tampering | `CRON_SECRET` 헤더 검증 (기존 `/api/cron/*` 패턴) |
| SQL injection via searchParams | Tampering | Supabase `.eq()` 파라미터화 쿼리 |
| 공개 데이터 RLS 우회 | Elevation | `USING (true)` 정책 + anonymous key 제한 |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 창원·김해 단지의 최근 12개월 jeonse 거래가 충분해서 3건 이상 기준을 맞추는 단지 수가 의미있을 것 | 집계 전략 | 데이터 희박 시 갭 분석 가능 단지가 너무 적어 랭킹 페이지가 빈 테이블 |
| A2 | 위험도 구간(40%/60%)이 창원·김해 지역 데이터에 적합 | 위험도 기준 | 단지 전부 '주의' 구간에 몰리면 배지가 의미 없음; 실데이터 확인 후 구간 조정 필요 |
| A3 | `PERCENTILE_CONT` SQL RPC 함수 실행 시간이 daily 배치 내에서 허용 범위 (< 30초) | DB 설계 | 창원·김해 전체 거래 건수가 수십만이면 타임아웃 가능; `EXPLAIN ANALYZE` 필요 |
| A4 | 기존 `daily-batch` cron 독립 추가 없이 `/api/cron/gap-stats` 별도 cron으로 구성 | 구현 순서 | Vercel Hobby 플랜의 cron job 수 제한 존재 가능 |

---

## Open Questions

1. **Vercel cron job 수 제한**
   - 현재 vercel.json에 2개 cron 등록됨 (`/api/cron/daily`, `/api/cron/cafe-articles`)
   - Vercel Hobby 플랜: 2개 cron job 제한 [ASSUMED]
   - 권장: gap-stats 계산을 `/api/cron/daily` 내부에 추가 (별도 엔드포인트 대신). `daily/route.ts` 끝에 `computeGapStats(supabase)` 호출 추가.

2. **실 데이터에서 갭 통계 가능 단지 수 확인**
   - 실제 DB 쿼리로 매매 ≥ 3 AND 전세 ≥ 3 건을 만족하는 단지 수를 확인해야 함
   - 권장: Wave 0 완료 후 `SELECT COUNT(*) FROM complex_gap_stats` 확인

3. **`risk_level` 구간 적절성**
   - 창원·김해 실데이터 전세가율 분포에 따라 `40%/60%` 임계값 조정 필요 여부
   - 권장: 집계 실행 후 `SELECT risk_level, COUNT(*) FROM complex_gap_stats GROUP BY risk_level` 확인

---

## Environment Availability

Step 2.6: 이 Phase는 기존 인프라(Supabase, Next.js, Vercel)를 활용하므로 신규 외부 의존성 없음.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Postgres | SQL 집계 | ✓ | 기존 | — |
| Next.js 15 App Router | RSC 페이지 | ✓ | 기존 | — |
| Vitest | 단위 테스트 | ✓ | 기존 | — |
| Vercel Cron | 일배치 | ✓ | 기존 | daily 내부 추가 |

---

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/20260430000003_transactions.sql` — `deal_type` enum 실제값 (`sale`, `jeonse`, `monthly`) 확인
- `src/lib/data/rankings.ts` — 기존 집계 패턴 (분석 대상)
- `src/app/api/cron/rankings/route.ts` — cron 엔드포인트 패턴
- `src/app/api/cron/daily/route.ts` — daily 배치 패턴
- `src/app/complexes/[id]/page.tsx` — 단지 상세 페이지 구조
- `supabase/migrations/20260507000001_complex_rankings.sql` — DB 테이블 설계 기준

### Secondary (MEDIUM confidence)
- [marketingstorylab.com — 전세가율 기준값](https://marketingstorylab.com/entry/%EC%A0%84%EC%84%B8%EA%B0%80%EC%9C%A8%EA%B3%BC-%EA%B0%AD%ED%88%AC%EC%9A%90-%EC%A0%81%EC%A0%95%EC%A7%80%EC%97%AD-%EA%B3%84%EC%82%B0%EB%B2%95-%EC%A3%BC%EC%9D%98%EC%82%AC%ED%95%AD) — 전세가율 60% 이하 안전, 80% 이상 위험 기준
- [landibagu.com — 깡통전세 판별](https://landibagu.com/%EA%B9%A1%ED%86%B5%EC%A0%84%EC%84%B8-%ED%8C%90%EB%B3%84-%EA%B3%B5%EC%8B%9D-%EA%B3%84%EC%82%B0%EA%B8%B0-%EC%97%86%EC%9D%B4-3%EB%B6%84-%EB%A7%8C%EC%97%90-%EC%9C%84%ED%97%98-%EC%9E%A1%EC%95%84%EB%82%B4/) — 전세가율 80% 위험 기준 (부동산R114 인용)
- [leafo.net — PostgreSQL PERCENTILE_CONT](https://leafo.net/guides/postgresql-calculating-percentile.html) — 중위값 계산 방법

### Tertiary (LOW confidence)
- [apt2.me — 아파트미 갭투자](https://apt2.me/apt/AptGap.jsp) — 갭투자 분석 UI 패턴 (접근 불가로 직접 확인 실패)
- Vercel Hobby 플랜 cron job 수 제한 — ASSUMED (공식 문서 미확인)

---

## Metadata

**Confidence breakdown:**
- 기존 코드 패턴 (rankings.ts, daily route): HIGH — 코드 직접 확인
- DB 스키마 (`deal_type` enum, transactions 구조): HIGH — 마이그레이션 직접 확인
- 한국 갭투자 위험도 기준: MEDIUM — 복수 업계 자료 인용, 법정 기준 아님
- Vercel cron 제한: LOW — ASSUMED, 공식 문서 미확인

**Research date:** 2026-05-28
**Valid until:** 2026-07-01 (Next.js / Supabase API 변경 가능성 낮음; 위험도 기준은 시장 변화 무관)
