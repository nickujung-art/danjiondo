---
phase: 22-ai-price-prediction
plan: "01"
subsystem: prediction-engine
tags: [prediction, holt-winters, time-series, typescript, tdd]
dependency_graph:
  requires: []
  provides: [src/lib/prediction/engine.ts]
  affects: [22-02-batch, 22-03-chart]
tech_stack:
  added: []
  patterns: [holt-winters, double-exponential-smoothing, linear-regression, grid-search]
key_files:
  created:
    - src/lib/prediction/engine.ts
    - src/lib/prediction/engine.test.ts
  modified: []
decisions:
  - "신뢰구간에 √h 스케일링 적용 — horizon이 길수록 불확실성 증가 반영"
  - "holtwinters는 승법(multiplicative) 계절성 사용 — 가격 데이터는 계절 효과가 level에 비례"
  - "computeMape에서 holdout = min(6, n/4) — 짧은 시계열에서 과적합 방지"
metrics:
  duration: "~1시간"
  completed: "2026-05-29"
  tasks_completed: 1
  tasks_total: 1
  files_created: 2
  files_modified: 0
---

# Phase 22 Plan 01: TypeScript 예측 엔진 Summary

**One-liner:** 외부 라이브러리 없는 순수 TypeScript Holt-Winters + 이중지수평활 + 선형회귀 예측 엔진 (TDD, 17개 테스트 PASS)

## Objective

Phase 22 Wave 1-B: 데이터 길이에 따라 자동으로 알고리즘을 선택하는 `forecast()` 래퍼와 세 가지 예측 알고리즘을 순수 TypeScript로 구현. GitHub Actions 배치(22-02)와 /invest 차트(22-03) 양쪽에서 임포트 가능한 `server-only` 의존 없는 모듈.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | 예측 엔진 TypeScript 구현 (TDD) | a29c0ab | src/lib/prediction/engine.ts, engine.test.ts |

## TDD Gate Compliance

- RED: `engine.test.ts` 작성 → `engine.ts` 없어 빌드 오류 (ImportError 확인)
- GREEN: `engine.ts` 구현 → 17/17 테스트 PASS
- REFACTOR: 별도 리팩터링 불필요 (구현 중 구조 정리 완료)

## What Was Built

### `src/lib/prediction/engine.ts`

알고리즘 선택 규칙:

| 데이터 수 | 알고리즘 | 이유 |
|-----------|----------|------|
| < 6개 | null 반환 | 예측 불가 (D-07 graceful degradation) |
| 6-11개 | `linearForecast()` | 계절성 탐지 불가, 선형 추세만 |
| 12-23개 | `doubleExp()` | 1년치 미만 → 계절성 없는 Holt's linear |
| >= 24개 | `holtwinters()` | 2+ 계절 주기 → 삼중지수평활 가능 |

핵심 구현:
- `holtwinters()`: period=12, α/β/γ 각 5단계 × 125 조합 그리드 탐색, 승법 계절성
- `doubleExp()`: α/β 각 5단계 × 25 조합 그리드 탐색, Holt's linear method
- `linearForecast()`: 최소제곱법 (β₁ = (n·Σxy - Σx·Σy) / (n·Σx² - (Σx)²))
- 신뢰구간: 잔차 std × 1.96 × √h (horizon 스케일링으로 원거리 불확실성 표현)
- trainingMape: 마지막 hold-out 최대 6개월 one-step-ahead MAPE, 0~1 클리핑
- NaN/Infinity/음수 입력 필터링 (T-22-01-01 Tampering 위협 완화)

### `src/lib/prediction/engine.test.ts`

17개 Vitest 단위 테스트:
- `forecast()` 래퍼: 모델 선택 경계값 6가지 + 예측 월 순서 + CI 보장 + MAPE 범위 + trainingCount
- `linearForecast()`: 상승 데이터 기울기
- `doubleExp()`: 길이·CI 보장
- `holtwinters()`: 길이·CI 보장

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] 신뢰구간 √h 스케일링 추가**
- **Found during:** Task 1 (GREEN 구현)
- **Issue:** 계획 명세는 "잔차 std × 1.96"으로 모든 horizon에 동일한 CI 폭 적용. 이는 horizon=6에서 CI가 비현실적으로 좁아지는 문제 발생 (단조 상승 데이터에서 잔차 std가 매우 작음).
- **Fix:** `buildConfidenceIntervals()`에 `Math.sqrt(h + 1)` 스케일링 추가 — 표준 시계열 CI 관행과 일치
- **Files modified:** src/lib/prediction/engine.ts
- **Commit:** a29c0ab (동일 커밋)

## Known Stubs

없음 — 모든 함수가 실제 계산을 수행하며 placeholder 없음.

## Threat Surface Scan

신규 네트워크 엔드포인트 없음. 외부 API 호출 없음. 순수 계산 모듈 — 위협 표면 추가 없음.

T-22-01-01 (Tampering): `sanitizePrices()`로 NaN/Infinity/음수 필터링 구현 완료.

## Self-Check: PASSED

- [x] `src/lib/prediction/engine.ts` 존재
- [x] `src/lib/prediction/engine.test.ts` 존재
- [x] 커밋 a29c0ab 존재
- [x] 17/17 Vitest 테스트 PASS
- [x] `forecast`, `holtwinters`, `doubleExp`, `linearForecast`, `PredictionResult` 모두 export
- [x] `server-only` 임포트 없음
- [x] forecast(5개) === null
- [x] forecast(28개).modelName === 'holt-winters'
- [x] 신뢰구간 lower <= mean <= upper 모든 케이스에서 보장
