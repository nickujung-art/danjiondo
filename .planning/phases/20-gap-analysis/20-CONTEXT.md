# Phase 20: 갭투자 분석 — Context

**Gathered:** 2026-05-28
**Status:** Ready for research → planning
**Source:** 대화 분석 (사용자 요구사항 직접 수집)

<domain>
## Phase Boundary

갭투자(gap investment) 분석 기능 구현. 기존 `transactions` 테이블의 매매/전세 실거래가 데이터를 활용해
갭(매매가 − 전세가)을 계산하고, 갭 비율 기반 위험도(안전/주의/위험)를 표시한다.

**범위 내:**
- 단지별 갭투자 지표 계산 (갭 금액, 갭 비율, 전세가율, 추이)
- 단지 상세 페이지에 갭투자 섹션 추가
- 전용 `/gap-analysis` 페이지 (지역별 갭 비율 랭킹)
- 위험도 신호등 배지 (안전/주의/위험) + 숫자 표시
- 계산 결과를 DB에 캐시 (cron 또는 on-demand 갱신)

**범위 밖 (이 Phase에서 다루지 않음):**
- 네이버 부동산 스크래핑 (ToS 위반 위험, 상업적 이용 불가)
- 외부 전세가 API (없음 — 국토부 API는 전세 실거래 포함)
- 실시간 매물 조회 (범위 확장 지양)
- 대출 정보 연동

</domain>

<decisions>
## Implementation Decisions

### D-01: 노출 위치
사용자 결정: **단지 상세 페이지 + 전용 갭투자 분석 페이지** 둘 다 구현.

- 단지 상세 (`/complex/[id]`): 갭투자 요약 카드 (최신 갭 금액 + 비율 + 신호등 배지)
- 전용 페이지 (`/gap-analysis`): 창원·김해 전체 단지 갭 비율 랭킹 테이블

### D-02: 위험도 표현
사용자 결정: **숫자 + 신호등 배지 둘 다** 표시.

- 숫자: 갭 금액(억/만원 단위), 갭 비율(%), 전세가율(%)
- 신호등 배지:
  - 🟢 안전: 갭 비율 40% 미만 (전세가율 60% 이상)
  - 🟡 주의: 갭 비율 40~60% (전세가율 40~60%)
  - 🔴 위험: 갭 비율 60% 초과 (전세가율 40% 미만)
- 실제 구현 시 이모지 사용 금지 — CSS 색상 원형 dot 또는 인라인 SVG

### D-03: 데이터 소스
국토부 실거래 API 데이터 (`transactions` 테이블):
- `deal_type = 'sale'` → 매매가 (deal_amount)  [VERIFIED: transactions.sql]
- `deal_type = 'jeonse'` → 전세보증금 (deal_amount)  [VERIFIED: transactions.sql]
- `deal_type = 'monthly'` → 월세 (제외 — 보증금 혼합이라 갭 계산에 부적합)
- 같은 단지(`complex_id`) 내 가장 최근 매매/전세 거래를 기준으로 갭 산출
- 기간: 최근 12개월 중위값 또는 최근 3개월 평균 (연구 후 결정)

### D-04: 계산 방식 (갭투자 메커니즘)
```
갭 금액 = 매매가 중위값 − 전세보증금 중위값
갭 비율 = 갭 금액 / 매매가 중위값 × 100
전세가율 = 전세보증금 중위값 / 매매가 중위값 × 100 (= 100 − 갭 비율)
```
- 계산 단위: 단지별 (complex_id)
- 면적 구간별 세분화는 연구 후 결정 (우선 단지 전체 중위값)
- 데이터 부족 시 (거래 건수 < 3) → 표시 불가 처리

### D-05: DB 캐시 전략
- `complex_gap_stats` 뷰 또는 materialized 테이블에 캐시
- 일배치 cron(`daily-batch`)에 갭 통계 재계산 추가
- 단지 상세 페이지는 캐시 테이블 조회 (실시간 계산 X)

### D-06: UI 원칙
- AI 슬롭 금지 (CLAUDE.md): backdrop-blur, gradient-text, glow, 보라/인디고, gradient orb 없음
- 이모지 아이콘 금지 — SVG path 또는 CSS dot
- 데이터 없는 단지: 갭투자 섹션 숨김 처리

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 기존 데이터
- `transactions` 테이블: `deal_type`, `deal_amount`, `complex_id`, `deal_date`, `cancel_date`, `superseded_by`, `exclusive_area`
- `complexes` 테이블: `id`, `name`, `sgg_code`, `road_address`, `lat`, `lng`
- `src/lib/data/realprice.ts` — 실거래 ingest 로직 (데이터 구조 참조)
- `src/app/complex/[id]/page.tsx` — 단지 상세 페이지 (갭 섹션 추가 위치)

### 참조 파일 (패턴 확인용)
- `src/lib/data/rankings.ts` — 랭킹 계산 패턴 (complex_id별 집계)
- `src/app/api/cron/rankings/route.ts` — 배치 계산 → DB 저장 패턴
- `src/lib/data/cron-status.ts` — markCronSuccess/Failed 패턴
- `src/app/admin/status/page.tsx` — data_sources 업데이트 패턴
- `CLAUDE.md` — AI 슬롭 금지, RSC-first, Supabase 쿼리는 서버에서만

### 기존 UI 패턴
- 가격 표시: `억` / `만원` 단위 포맷 (기존 complex 상세 페이지 준수)
- 배지/칩: 기존 `<span style={{ background, color: '#fff' }}>` 인라인 패턴
- 테이블: 기존 어드민 테이블 스타일 준수 (card + overflow:hidden + borderCollapse)

</canonical_refs>

<specifics>
## Specific Ideas

### 단지 상세 갭투자 카드 스케치
```
┌─────────────────────────────────────────┐
│  갭투자 분석                    🟡 주의  │
├─────────────────────────────────────────┤
│  갭 금액        갭 비율    전세가율       │
│  1억 2,500만    52.1%      47.9%         │
│                                         │
│  기준: 최근 12개월 거래 중위값           │
│  매매 N건 / 전세 N건 분석              │
└─────────────────────────────────────────┘
```

### /gap-analysis 페이지 스케치
```
갭투자 분석 — 창원·김해
단지별 갭 비율 랭킹 (전체 N개 단지)

[지역 필터▼] [정렬: 갭 비율 높은 순▼]

# 단지명              갭 비율  갭 금액    위험도
1 래미안 창원…         72.3%   2.1억     🔴 위험
2 힐스테이트 의창…     58.4%   1.8억     🟡 주의
3 두산위브…            38.2%   0.9억     🟢 안전
```

### 위험도 색상 (CSS, 이모지 X)
```css
.badge-safe    { background: #16a34a; color: #fff }  /* 안전 */
.badge-caution { background: #d97706; color: #fff }  /* 주의 */
.badge-danger  { background: #dc2626; color: #fff }  /* 위험 */
```

</specifics>

<deferred>
## Deferred Ideas

- 면적 구간별 갭 분석 (59㎡, 84㎡ 등 타입별)
- 시계열 갭 추이 그래프 (Recharts)
- 전세가율 히스토리 (월별 변화)
- 지도 오버레이 (갭 비율 히트맵)
- 알림 기능 (갭 비율 변화 임계값 도달 시 push notification)
- 전세 역전 경보 (전세가 > 매매가)

</deferred>

---

*Phase: 20-gap-analysis*
*Context gathered: 2026-05-28 (사용자 결정 + CLAUDE.md 원칙)*
