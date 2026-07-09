---
phase: 34-db-2
plan: "00"
subsystem: database
tags: [supabase, regions, molit, seed]

requires:
  - phase: 33-db-1
    provides: getActiveSggCodes()/getActiveCityNames()/getActiveRegionAddrs() 공용 헬퍼 (src/lib/data/regions.ts) — 코드 변경 없이 재사용
provides:
  - regions 테이블에 부산광역시 16개 구·군 (sgg_code 26xxx, is_active=true, gu 컬럼 non-null)
  - 부산 16개 sgg_code가 실제 유효한 국토부 LAWD_CD임을 202606 단발 백필로 실증 확인
  - seed-region.test.ts 부산 확장 assertion (count>=38, gu non-null 16건)
affects: [34-01, 34-02, 34-03, 34-04, 34-05, 34-06, 34-07, 34-08]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - scripts/seed.ts
    - src/__tests__/seed-region.test.ts

key-decisions:
  - "Task 2 검증 백필(202606, 16개 코드) 실행 중 executor 세션 이슈로 동일 스크립트가 중복 실행됨 — 오케스트레이터가 중복 프로세스 트리를 종료하고 원본 프로세스가 완주하도록 조치, SUMMARY.md는 오케스트레이터가 직접 작성"

patterns-established: []

requirements-completed: [REGION-12]

duration: ~35min (executor 실행 + 오케스트레이터 완료 확인 포함)
completed: 2026-07-09
---

# Phase 34-00: 부산광역시 regions 시딩 Summary

**regions 테이블에 부산 16개 구·군 시딩 완료, 202606 단발 백필로 전체 sgg_code 유효성 실증 확인 (38개 활성 지역 = 경남 22 + 부산 16)**

## Performance

- **Duration:** ~35min
- **Tasks:** 3/3 완료
- **Files modified:** 2

## Accomplishments
- regions 테이블에 부산광역시 16개 구·군(sgg_code 26110~26710) 시딩, is_active=true, gu 컬럼 non-null (구 있는 광역시 패턴 확인)
- 부산 16개 sgg_code 전체에 대해 202606 단발 백필 실행 — 전 코드에서 rows_upserted > 0 확인, 법정동코드 유효성 실증 검증 완료 (해운대구 26350: 402+71건, 부산진구 26230: 386+70건, 사하구 26380: 290+59건 등)
- seed-region.test.ts에 부산 확장 assertion 추가 (count>=38, gu non-null 16건)

## Task Commits

1. **Task 1: regions 부산 16개 구·군 시딩** - `eb44c55` (feat)
2. **Task 2: 부산 16개 법정동코드 단발 검증** - 코드 변경 없음(검증 전용), ingest_runs 실측으로 확인 완료
3. **Task 3: seed-region.test.ts 부산 확장 assertion 추가** - `96ce8c8` (test)

## Files Created/Modified
- `scripts/seed.ts` - 부산 16개 구·군 regions row 추가
- `src/__tests__/seed-region.test.ts` - count>=38, gu non-null 16건 assertion

## Decisions Made
- Task 2 검증은 코드 변경이 없는 순수 실행 검증이므로 커밋 없음 — `ingest_runs` 테이블의 실측 결과(16개 sgg_code × 2 source_id 전부 status='success', rows_upserted>0)로 acceptance_criteria 충족을 확인

## Deviations from Plan

### 실행 중 이슈 (오케스트레이터 개입)

**1. Task 2 검증 백필 중복 실행**
- **Found during:** Task 2 (부산 16개 법정동코드 단발 검증)
- **Issue:** executor 서브에이전트가 검증 백필 스크립트(`backfill-realprice.ts --sgg=... --from=202606 --to=202606`)를 실행한 뒤 백그라운드 작업 완료를 기다리지 않고 응답을 종료 — 이 과정에서 동일 명령이 두 개의 독립 프로세스 트리로 중복 실행된 상태였음(원인 불명, 재시도로 추정)
- **Fix:** 오케스트레이터가 `Get-CimInstance Win32_Process`로 중복 프로세스 트리(PID 36808/35568/19376)를 식별해 종료, 원본 프로세스 트리(PID 28848/33304/25232)는 완주하도록 유지. 5회에 걸쳐 `ingest_runs` 진행 상황을 폴링하며 16개 코드 전부 완료될 때까지 대기
- **Verification:** 최종 쿼리로 16개 sgg_code × 2 source_id(molit_trade, molit_villa_trade) 전부 status='success', rows_upserted>0 확인. 종료된 중복 프로세스가 남긴 stale 'running' row 1건(26350/molit_trade)은 무해한 잔여 레코드(이전 세션에서 확인된 "cleaned up by next run" 패턴과 동일 성격)로 별도 조치 불필요
- **SUMMARY.md 누락 보완:** executor가 SUMMARY.md를 작성하지 못하고 종료했으므로, 오케스트레이터가 검증 완료를 확인한 뒤 직접 작성

---

**Total deviations:** 1 (실행 세션 이슈, 계획 자체의 결함 아님)
**Impact on plan:** 검증 로직·결과에는 영향 없음. 최종적으로 acceptance_criteria 전부 충족됨.

## Issues Encountered
- 위 "Task 2 검증 백필 중복 실행" 참고. 결과적으로 문제없이 해결됨.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- regions 테이블에 부산 16개 구·군이 확정되어, Wave 1(34-01~34-04)의 모든 동적 조회 파이프라인이 자동으로 부산을 포함하게 됨
- 법정동코드 유효성이 실증 확인되어 34-06(10년 전체 백필) 착수 리스크 낮음

---
*Phase: 34-db-2*
*Completed: 2026-07-09*
