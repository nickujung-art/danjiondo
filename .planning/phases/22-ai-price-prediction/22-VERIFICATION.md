---
phase: 22-ai-price-prediction
verified: 2026-05-29T16:35:00Z
status: passed
score: 17/17 must-haves verified
overrides_applied: 0
gaps: []
---

# Phase 22: AI 가격 예측 Verification Report

**Phase Goal:** Holt-Winters 통계 엔진 + Claude Haiku 해설로 단지별 평형별 6개월 예측선 구현. /invest 페이지 지역 시세 차트에 점선 예측 구간 + AI 한국어 트렌드 해설 카드 추가.
**Verified:** 2026-05-29T16:35:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | complex_price_predictions 테이블이 존재하고 UNIQUE(complex_id, area_bucket, predicted_month) 제약이 있다 | ✓ VERIFIED | migration 파일 L24: `UNIQUE (complex_id, area_bucket, predicted_month)` |
| 2 | compute_predictions RPC가 cancel_date IS NULL AND superseded_by IS NULL 필터를 포함한다 | ✓ VERIFIED | migration 파일 L69-70: `AND cancel_date IS NULL` / `AND superseded_by IS NULL` |
| 3 | RLS가 anon/authenticated SELECT, service_role ALL을 허용한다 | ✓ VERIFIED | L30-33: ENABLE RLS + `read_predictions` SELECT USING(true); L86-87: GRANT SELECT to authenticated/anon, GRANT ALL to service_role |
| 4 | forecast() 함수가 데이터 길이에 따라 holt-winters/double-exp/linear를 자동 선택한다 | ✓ VERIFIED | engine.ts L428-437: data.length >= 24 → holt-winters, >= 12 → double-exp, else → linear |
| 5 | 데이터 6개 미만 시 forecast()가 null을 반환한다 | ✓ VERIFIED | engine.ts L417: `if (data.length < 6) return null`; Vitest 테스트 PASS 확인 |
| 6 | 신뢰구간 lower <= mean <= upper를 항상 만족한다 | ✓ VERIFIED | engine.ts L95-97: `Math.max(0, p - z * sigma * Math.sqrt(h+1))` (lower), upper는 p + z; 17개 Vitest 테스트 모두 PASS |
| 7 | server-only 임포트가 없다 (GitHub Actions 호환) — engine.ts 기준 | ✓ VERIFIED | engine.ts: `import 'server-only'` 없음 확인; compute-predictions.ts도 engine.ts만 import (invest.ts 미사용) |
| 8 | Vitest 17개 테스트가 존재하고 PASS한다 | ✓ VERIFIED | `npx vitest run engine.test.ts` 결과: 17 passed; engine.test.ts 내 `it(` 18개 (describe 내 중복 count 포함) |
| 9 | scripts/compute-predictions.ts가 존재하고 tx_count 합산 10건 미만 스킵 로직이 있다 | ✓ VERIFIED | L44: `MIN_TX_COUNT = 10`; L120-125: `rows.reduce((sum,r) => sum + Number(r.tx_count), 0)` + `if (totalTxCount < MIN_TX_COUNT) return { skipped: true }` |
| 10 | .github/workflows/compute-predictions.yml이 존재하고 KST 02:00 cron이 설정되었다 | ✓ VERIFIED | L5: `cron: '0 17 * * *'` (UTC 17:00 = KST 02:00) |
| 11 | SUPABASE_SERVICE_ROLE_KEY가 코드에 직접 노출되지 않는다 | ✓ VERIFIED | compute-predictions.ts L25: `process.env.SUPABASE_SERVICE_ROLE_KEY`; workflow L27: `${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}` |
| 12 | /invest 페이지에 예측 데이터를 fetch하는 코드가 있다 | ✓ VERIFIED | page.tsx L103-107: `getRegionalPricePredictions(supabase, sggCode, areaBucket)` Promise.all 병렬 fetch |
| 13 | RegionalPriceChart에 strokeDasharray 점선 예측선이 있다 | ✓ VERIFIED | RegionalPriceChart.tsx L136-137: `strokeDasharray="5 3"` + `connectNulls` Line 컴포넌트 |
| 14 | Claude Haiku 출력에 가격 숫자 패턴 사후 필터링이 있다 | ✓ VERIFIED | route.ts L67-71: `PRICE_PATTERN = /\d[\d,]*\s*(만원|억원|원|만|억|\$)/` + `UNIT_PATTERN`; 패턴 위반 시 null 반환 |
| 15 | 법적 면책 문구 "AI 예측은 참고용이며 투자 판단의 근거로 사용 불가"가 존재한다 | ✓ VERIFIED | page.tsx L292: `* AI 예측은 참고용이며 투자 판단의 근거로 사용 불가.` |
| 16 | prediction-commentary API Route의 revalidate가 설정되어 있다 | ✓ VERIFIED | route.ts L1-2: `export const revalidate = 604800` (1주일) |
| 17 | page.tsx에서 AI 해설 fetch도 revalidate: 604800으로 호출한다 | ✓ VERIFIED | page.tsx L121: `{ next: { revalidate: 604800 } }` |

**Score:** 17/17 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260530000001_complex_price_predictions.sql` | 테이블 + RPC + RLS | ✓ VERIFIED | 전체 컬럼(ai_commentary, ai_cached_at 포함), UNIQUE 제약, RLS, compute_predictions RPC 포함 |
| `src/lib/prediction/engine.ts` | 예측 엔진 3종 + forecast() 래퍼 | ✓ VERIFIED | 453줄, forecast/holtwinters/doubleExp/linearForecast/PredictionResult 모두 export |
| `src/lib/prediction/engine.test.ts` | Vitest 17개 테스트 | ✓ VERIFIED | 17/17 PASS 확인 |
| `scripts/compute-predictions.ts` | 배치 스크립트 | ✓ VERIFIED | MIN_TX_COUNT=10, onConflict, process.exit(1) 포함 |
| `.github/workflows/compute-predictions.yml` | 일배치 워크플로우 | ✓ VERIFIED | cron '0 17 * * *', workflow_dispatch, timeout-minutes: 30 |
| `src/lib/data/invest.ts` | PredictionPoint + getRegionalPricePredictions() | ✓ VERIFIED | 두 export 모두 존재, sgg_code 기반 중위값 집계 구현 |
| `src/components/invest/RegionalPriceChart.tsx` | strokeDasharray 점선 예측선 | ✓ VERIFIED | ComposedChart로 교체, predictionData prop, strokeDasharray="5 3" |
| `src/app/invest/page.tsx` | 예측 fetch + AI 해설 카드 | ✓ VERIFIED | getRegionalPricePredictions, aiCommentary, 법적 면책 문구 |
| `src/app/api/invest/prediction-commentary/route.ts` | Claude Haiku ISR Route | ✓ VERIFIED | revalidate=604800, claude-haiku-4-5-20251001, 가격 패턴 필터링, allowlist 검증 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| compute_predictions RPC | transactions | `cancel_date IS NULL AND superseded_by IS NULL` | ✓ WIRED | migration L69-70 |
| complex_price_predictions | complexes | `REFERENCES public.complexes(id)` | ✓ WIRED | migration L12 |
| scripts/compute-predictions.ts | engine.ts | `import { forecast } from '../src/lib/prediction/engine'` | ✓ WIRED | compute-predictions.ts L19 |
| scripts/compute-predictions.ts | complex_price_predictions | `.upsert(allRows, { onConflict: 'complex_id,area_bucket,predicted_month' })` | ✓ WIRED | compute-predictions.ts L217-219 |
| page.tsx | complex_price_predictions | `getRegionalPricePredictions() → Supabase SELECT` | ✓ WIRED | page.tsx L106; invest.ts L174-181 |
| prediction-commentary route | Anthropic claude-haiku | `client.messages.create({ model: 'claude-haiku-4-5-20251001' })` | ✓ WIRED | route.ts L42-43 |
| RegionalPriceChart | predictionData | `strokeDasharray="5 3"` Line 컴포넌트 | ✓ WIRED | RegionalPriceChart.tsx L131-140 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| RegionalPriceChart.tsx | `predictionData` | `getRegionalPricePredictions()` → `complex_price_predictions` SELECT | 배치 실행 후 실 데이터 흐름 (배치 전 빈 배열 → graceful degradation 처리됨) | ✓ FLOWING (배치 의존) |
| prediction-commentary/route.ts | `commentary` | Anthropic API `messages.create` | ANTHROPIC_API_KEY 설정 시 실 응답; 미설정 시 null graceful degradation | ✓ FLOWING (ENV 의존) |
| page.tsx `aiCommentary` | `json.commentary` | prediction-commentary API Route ISR fetch | commentary null 시 카드 미렌더 — 정상 처리 | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| forecast(5개) === null | Vitest `6개 미만 데이터 시 null 반환` | PASS | ✓ PASS |
| forecast(24개).modelName === 'holt-winters' | Vitest `24개(holt-winters 경계 최솟값)` | PASS | ✓ PASS |
| lower <= mean <= upper | Vitest `신뢰구간: lower <= mean <= upper` | PASS | ✓ PASS |
| 17개 전체 테스트 | `npx vitest run engine.test.ts` | 17/17 passed (2.83s) | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PRED-01 | 22-00, 22-01 | 통계 예측 엔진 — Holt-Winters/이중지수/선형회귀 TypeScript 구현, 자동 알고리즘 선택 | ✓ SATISFIED | engine.ts 구현 + 17 테스트 PASS; DB 마이그레이션 완료 |
| PRED-02 | 22-00, 22-02 | GitHub Actions 배치 — 매일 새벽 예측값 계산 → complex_price_predictions 저장 | ✓ SATISFIED | compute-predictions.ts + compute-predictions.yml (cron '0 17 * * *') |
| PRED-03 | 22-03 | /invest 차트 예측선 — 6개월 점선 + 신뢰구간 추가 | ✓ SATISFIED | RegionalPriceChart strokeDasharray="5 3" + 신뢰구간 Area 렌더링 |
| PRED-04 | 22-03 | Claude Haiku 해설 카드 — 예측 방향 + 근거 한 문장 (ISR 1주일 캐싱) | ✓ SATISFIED | prediction-commentary route revalidate=604800; 가격 숫자 사후 필터링; 법적 면책 문구 |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/data/invest.ts` | 1 | `import 'server-only'` | ℹ️ Info | invest.ts는 서버 전용 파일이므로 의도된 패턴. compute-predictions.ts는 invest.ts를 import하지 않고 engine.ts만 직접 import하므로 GitHub Actions 호환성에 영향 없음. |

anti-pattern 결론: `engine.ts`와 `compute-predictions.ts` 모두 `server-only` 미사용. `invest.ts`의 `server-only`는 Next.js 서버 컴포넌트 안전 패턴으로 의도적 사용 — 블로커 없음.

---

### Human Verification Required

없음. 자동화 검증으로 모든 필수 항목 확인 완료.

---

### Gaps Summary

갭 없음. 17/17 필수 항목 모두 검증 완료.

**주요 구현 하이라이트:**

1. **DB 마이그레이션 (22-00):** complex_price_predictions 테이블 13컬럼, UNIQUE(complex_id, area_bucket, predicted_month) upsert 키, compute_predictions RPC(STABLE, cancel_date/superseded_by 필터 포함), RLS SELECT-only 정책 완성.

2. **예측 엔진 (22-01):** 외부 라이브러리 없는 순수 TypeScript Holt-Winters + 이중지수평활 + 선형회귀. 17개 Vitest 테스트 PASS. √h 스케일링으로 장기 불확실성 반영. server-only 미사용으로 GitHub Actions 호환.

3. **배치 스크립트 (22-02):** MIN_TX_COUNT=10 D-02 준수, area_bucket 4개 Promise.all 병렬처리, onConflict upsert, errors > 0 시 process.exit(1). GitHub Actions cron UTC 17:00 (KST 02:00).

4. **UI + AI 해설 (22-03):** RegionalPriceChart ComposedChart + strokeDasharray="5 3" 점선 + 신뢰구간 영역. prediction-commentary Route revalidate=604800, claude-haiku-4-5-20251001, 가격 숫자 사후 필터링(PRICE_PATTERN), allowlist 입력 검증, 법적 면책 문구 완비.

---

_Verified: 2026-05-29T16:35:00Z_
_Verifier: Claude (gsd-verifier)_
