---
phase: 22-ai-price-prediction
plan: "03"
subsystem: ui-chart-ai
tags: [recharts, composedchart, prediction, claude-haiku, isr, invest-page]
dependency_graph:
  requires:
    - "22-00 (complex_price_predictions 테이블)"
    - "22-01 (예측 엔진 — PredictionResult 타입)"
  provides:
    - "src/lib/data/invest.ts — PredictionPoint 인터페이스 + getRegionalPricePredictions()"
    - "src/components/invest/RegionalPriceChart.tsx — 점선 예측선 + 신뢰구간 영역"
    - "src/app/api/invest/prediction-commentary/route.ts — Claude Haiku 해설 ISR Route"
  affects:
    - "/invest 페이지 — 예측선 + AI 해설 카드 표시"
tech_stack:
  added: []
  patterns:
    - "ComposedChart(Area+Line) 혼합 렌더링 — Recharts 예측선 오버레이"
    - "ISR Route revalidate=604800 패턴 — LLM 해설 1주일 캐시"
    - "allowlist 입력 검증 패턴 — URL searchParams → LLM 프롬프트 injection 방지"
key_files:
  created:
    - "src/app/api/invest/prediction-commentary/route.ts"
  modified:
    - "src/lib/data/invest.ts"
    - "src/components/invest/RegionalPriceChart.tsx"
    - "src/components/invest/RegionalPriceChartWrapper.tsx"
    - "src/app/invest/page.tsx"
decisions:
  - "AreaChart → ComposedChart 교체로 Area+Line 혼합 렌더링 지원 (Recharts AreaChart는 Line 미지원)"
  - "predictionData prop optional로 유지 — 데이터 없을 때 기존 차트 그대로 (D-07 graceful degradation)"
  - "Claude Haiku 프롬프트에 trend 방향(up/down/neutral) + MAPE만 전달 — 숫자 hallucination 원천 차단"
  - "ISR fetch: page.tsx에서 prediction-commentary API를 next.revalidate=604800으로 서버사이드 호출"
metrics:
  duration: "~8min"
  completed: "2026-05-29"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 4
requirements_completed:
  - PRED-03
  - PRED-04
---

# Phase 22 Plan 03: /invest 차트 예측선 + Claude Haiku 해설 카드 Summary

**One-liner:** RegionalPriceChart ComposedChart 예측 점선(strokeDasharray='5 3') + Claude Haiku ISR 해설 카드를 /invest 페이지에 통합 (숫자 hallucination 방지 시스템 프롬프트, allowlist 입력 검증, 법적 면책 강화)

## Objective

Phase 22 Wave 2-B: 통계 예측 수치(complex_price_predictions)를 차트 위에 점선으로 시각화하고, Claude Haiku로 숫자 없는 트렌드 방향 해설을 1주일 ISR 캐싱으로 제공.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | invest.ts PredictionPoint + getRegionalPricePredictions, RegionalPriceChart 예측 점선 | 1278346 | src/lib/data/invest.ts, RegionalPriceChart.tsx, RegionalPriceChartWrapper.tsx |
| 2 | /invest page.tsx 통합 + Claude Haiku 해설 카드 + prediction-commentary API Route | 52a3a73 | src/app/invest/page.tsx, src/app/api/invest/prediction-commentary/route.ts |

## What Was Built

### `src/lib/data/invest.ts` 확장

- `PredictionPoint` 인터페이스 export (yearMonth/mean/lower/upper/modelName/trainingMape)
- `getRegionalPricePredictions()`: sgg_code → complexes id 조회 → complex_price_predictions 조회(최근 2일) → 월별 중위값 집계
- sggCode/areaBucket 없으면 즉시 빈 배열 반환 (graceful degradation)

### `src/components/invest/RegionalPriceChart.tsx` 수정

- AreaChart → ComposedChart 교체 (Area + Line 혼합)
- `predictionData?: PredictionPoint[]` prop 추가
- 예측 점선: `strokeDasharray="5 3"` Line 컴포넌트 (connectNulls)
- 신뢰구간: predUpper Area(fillOpacity 0.08) + predLower 흰 Area(fillOpacity 1)로 표시
- MAPE 배지: 예측선 존재 시 "예측 참고선 — 평균 오차 약 N%" 표시
- predictionData 없을 때 에러 없이 기존 차트만 표시 (D-07)

### `src/app/api/invest/prediction-commentary/route.ts` 신규

- `export const revalidate = 604800` (1주일 ISR)
- GET handler: sgg_code/area_bucket/trend allowlist 검증 → 미허용 값 400 반환 (T-22-03-01)
- model: `claude-haiku-4-5-20251001`, max_tokens: 200
- 시스템 프롬프트: 가격 숫자/단정적 예측/투자조언 금지 (T-22-03-02)
- ANTHROPIC_API_KEY 없으면 commentary: null 반환 (graceful degradation)

### `src/app/invest/page.tsx` 수정

- predictions 병렬 fetch (기존 Promise.all에 추가)
- AI 해설 ISR fetch: sggCode+areaBucket+predictions 조건부 호출, next.revalidate=604800
- RegionalPriceChartWrapper에 predictionData prop 전달
- AI 해설 카드: aiCommentary null 시 미렌더
- 법적 면책 문구 강화: "AI 예측은 참고용이며 투자 판단의 근거로 사용 불가" 추가 (D-06)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] import type 오류 수정**
- **Found during:** Task 2 lint
- **Issue:** `import { NextRequest } from 'next/server'`가 ESLint `consistent-type-imports` 규칙 위반
- **Fix:** `import type { NextRequest }` 로 수정
- **Files modified:** src/app/api/invest/prediction-commentary/route.ts
- **Commit:** 52a3a73 (동일 커밋)

## Known Stubs

없음 — 모든 기능이 실제 데이터 소스(complex_price_predictions 테이블, Anthropic API)와 연결됨. 단, 배치 스크립트(22-02)가 실행되기 전까지는 complex_price_predictions 테이블이 비어 있어 예측선이 표시되지 않음 (graceful degradation — 차트는 정상 표시).

## Threat Surface Scan

신규 네트워크 엔드포인트 추가:

| Flag | File | Description |
|------|------|-------------|
| threat_flag: injection | src/app/api/invest/prediction-commentary/route.ts | URL searchParams(sgg_code, area_bucket, trend) → LLM 프롬프트 injection 가능 — T-22-03-01: allowlist 검증으로 mitigated |
| threat_flag: information_disclosure | src/app/api/invest/prediction-commentary/route.ts | Claude Haiku 응답이 숫자/투자조언 포함 가능 — T-22-03-02: 시스템 프롬프트 + max_tokens 200으로 mitigated |

## Self-Check: PASSED

- [x] `src/lib/data/invest.ts` PredictionPoint + getRegionalPricePredictions export 존재
- [x] `src/components/invest/RegionalPriceChart.tsx` predictionData prop + strokeDasharray 존재
- [x] `src/app/invest/page.tsx` getRegionalPricePredictions 호출 + aiCommentary + 법적 면책 문구 존재
- [x] `src/app/api/invest/prediction-commentary/route.ts` revalidate=604800 + haiku + 가격숫자 금지 존재
- [x] 커밋 1278346 존재 (Task 1)
- [x] 커밋 52a3a73 존재 (Task 2)
- [x] ESLint 경고/오류 없음
