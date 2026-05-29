---
phase: 22-ai-price-prediction
plan: "00"
subsystem: database
tags: [postgres, supabase, migrations, rls, rpc, predictions]

requires:
  - phase: 21-invest-analysis
    provides: "area_bucket 분류 로직(area_m2 기준 소형/59/84/대형), invest_price_history RPC 패턴"
  - phase: 07-data-pipeline
    provides: "transactions 테이블(complex_id uuid, deal_type enum, cancel_date, superseded_by, area_m2)"

provides:
  - "complex_price_predictions 테이블 (id, complex_id, area_bucket, predicted_month, predicted_price_mean, predicted_price_lower, predicted_price_upper, model_name, training_mape, training_count, ai_commentary, ai_cached_at, computed_at)"
  - "compute_predictions RPC (단지+타입별 월별 실거래 집계, STABLE)"
  - "RLS: anon/authenticated SELECT, service_role ALL"

affects:
  - "22-01 (예측 엔진 배치 스크립트 — compute_predictions 호출)"
  - "22-02 (GitHub Actions 배치 — complex_price_predictions UPSERT)"
  - "22-03 (UI RSC — complex_price_predictions SELECT)"

tech-stack:
  added: []
  patterns:
    - "pre-compute 예측값 DB 저장 패턴 (배치 INSERT → RSC SELECT)"
    - "RLS bypass: service_role 전용 INSERT, anon/authenticated READ-ONLY"
    - "area_m2 → area_bucket CASE 분류 (50/66/95 경계값) — Phase 21과 동일"

key-files:
  created:
    - "supabase/migrations/20260530000001_complex_price_predictions.sql"
  modified: []

key-decisions:
  - "compute_predictions HAVING COUNT(*) >= 1 — 10건 미만 필터링은 배치 스크립트(D-02)에서 처리, RPC는 원천 데이터만 반환"
  - "SECURITY DEFINER 사용 금지 — STABLE + 호출자 권한으로 충분 (읽기 전용)"
  - "model_name CHECK 4가지: holt-winters/double-exp/linear/insufficient-data — 데이터 부족 케이스 명시"

patterns-established:
  - "Pattern: DB pre-compute 예측값 저장 — 배치에서 계산, RSC에서 조회 전용"
  - "Pattern: ai_commentary + ai_cached_at 쌍 — LLM 해설 캐시 패턴"

requirements-completed:
  - PRED-01
  - PRED-02

duration: 5min
completed: 2026-05-29
---

# Phase 22 Plan 00: complex_price_predictions DB 마이그레이션 Summary

**complex_price_predictions 테이블(13컬럼) + compute_predictions RPC(STABLE) + RLS 정책을 Supabase 마이그레이션으로 생성 — Phase 22 예측 엔진의 데이터 기반**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-29T00:00:00Z
- **Completed:** 2026-05-29T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- complex_price_predictions 테이블: 예측값 저장, ai_commentary/ai_cached_at 포함, UNIQUE(complex_id, area_bucket, predicted_month) upsert 키
- compute_predictions RPC: 배치 스크립트 원천 데이터 조회용, cancel_date IS NULL AND superseded_by IS NULL 필터, area_m2 버킷 분류 포함
- RLS: anon/authenticated SELECT only, service_role GRANT ALL (RLS bypass)

## Task Commits

1. **Task 1: complex_price_predictions 테이블 + compute_predictions RPC + RLS** - `e5a9a20` (feat)

## Files Created/Modified

- `supabase/migrations/20260530000001_complex_price_predictions.sql` - complex_price_predictions 테이블, RLS, compute_predictions RPC, GRANT 정의

## Decisions Made

- compute_predictions RPC에서 10건 미만 필터링(D-02)은 `HAVING COUNT(*) >= 1`로 SQL 레벨 최소 필터만 적용하고, 실제 10건 미만 제외 로직은 배치 스크립트(22-01)에서 처리 — RPC는 원천 데이터 조회 역할 유지
- SECURITY DEFINER 사용 금지 — 읽기 전용 STABLE 함수는 호출자 권한으로 충분
- model_name CHECK에 'insufficient-data' 포함 — 데이터 부족으로 예측 불가한 케이스를 테이블 레벨에서 명시적으로 허용

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 22-01 (예측 엔진): compute_predictions RPC 호출 및 complex_price_predictions UPSERT 가능
- 22-02 (배치 워커): GitHub Actions에서 service_role key로 INSERT 가능
- 22-03 (UI): RSC에서 anon/authenticated client로 SELECT 가능

## Known Stubs

None - 마이그레이션 파일만 추가, UI 없음.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: tampering | supabase/migrations/20260530000001_complex_price_predictions.sql | complex_price_predictions INSERT는 service_role만 가능 (RLS SELECT-only + GRANT ALL to service_role) — T-22-00-01 mitigated |

---
*Phase: 22-ai-price-prediction*
*Completed: 2026-05-29*
