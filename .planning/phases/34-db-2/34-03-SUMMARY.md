---
phase: 34-db-2
plan: "03"
subsystem: database
tags: [supabase, postgis, kapt, dup-detection, seed]

requires:
  - phase: 34-00
    provides: regions 테이블 부산 16개 구·군 시딩 (sgg_code 26xxx, is_active=true) — getSggCodes()가 동적으로 포함
provides:
  - find_nearby_similar_complexes RPC (라이브 Supabase 적용 완료) — ST_DWithin + pg_trgm similarity 기반 log-only 중복 탐지
  - detectPotentialDuplicate 헬퍼 (src/lib/data/complex-matching.ts) — 34-05가 소비할 좌표+이름유사 중복 탐지 함수
  - 부산 16개 구·군 Golden Record(complexes) 1,463건 시딩 완료 (si/gu/household_count/built_year 99.2%+ 보강)
affects: [34-05, 34-06, 34-07]

tech-stack:
  added: []
  patterns:
    - "log-only dup-detection RPC: 병합 없이 후보만 반환, 호출자가 로그/CSV 기록 책임"

key-files:
  created:
    - supabase/migrations/20260708000001_find_nearby_similar_complexes.sql
    - src/lib/data/complex-matching.test.ts
  modified:
    - src/lib/data/complex-matching.ts

key-decisions:
  - "seed-complexes.ts/kapt-enrich.ts는 코드 변경 없이 그대로 실행 — regions.is_active 동적 조회로 부산이 자동 포함됨(34-00에서 이미 검증된 설계)"
  - "detectPotentialDuplicate는 scripts/seed-complexes.ts에 배선하지 않음 — KAPT 단지목록 API에 좌표 필드가 없어 시딩 시점 호출은 항상 스킵되는 결함이 plan-checker 사전 검증에서 발견되어 34-05로 이관"
  - "10분 Bash 도구 타임아웃 안에 38개 지역 전체를 한 번에 처리 불가 — seed-complexes.ts는 부산 16개 완료 후 타임아웃, 남은 경남 22개는 동일 함수(fetchComplexList/seedComplex)를 재사용하는 임시 스크립트(scripts/_tmp-seed-remaining.ts, 실행 후 삭제)로 완주"
  - "seedComplex의 UPDATE 경로가 built_year를 무조건부로 덮어씀(raw.kaptUseApproveYmd가 KaptComplex 스키마에 없어 항상 null) — 기존 경남 22개 지역 재시딩 시 이미 보강된 built_year가 null로 리셋되는 부작용 발견. kapt-enrich.ts를 10회 반복 실행해 전량 재수렴시킴(회귀 없음, 데이터 손실 아님 — idempotent 재보강으로 복구)"
  - "부산 1,463건 중 11건은 fetchKaptBasicInfo가 지속적으로 null을 반환해 si/household_count 미보강 상태로 잔존 — KAPT API 자체의 데이터 갭(Phase 33의 99.5% 보강률과 동일 패턴), 재실행으로 해결 불가능한 것을 2회 연속 동일 결과로 확인"

patterns-established: []

requirements-completed: [REGION-15]

duration: ~2h 40min
completed: 2026-07-09
---

# Phase 34 Plan 03: 부산 KAPT Golden Record 시딩 + dup-detection 인프라 Summary

**find_nearby_similar_complexes RPC(ST_DWithin+trigram) 라이브 적용, detectPotentialDuplicate 헬퍼 TDD 구현, 부산 16개 구·군 KAPT 단지 1,463건 시딩 후 kapt-enrich 10회 반복 실행으로 si 99.2%(1,452/1,463) 보강 완료**

## Performance

- **Duration:** ~2h 40min (대부분 kapt-enrich.ts 10회 반복 실행의 KAPT API 순차 호출 대기시간)
- **Tasks:** 3/3 완료
- **Files modified:** 3 (migration 1 신규, complex-matching.ts 1 수정, complex-matching.test.ts 1 신규)

## Accomplishments
- `find_nearby_similar_complexes` PostGIS RPC를 라이브 Supabase(`auoravdadyzvuoxunogh`)에 적용 — 기존 `location`(geography) 컬럼 + `pg_trgm` GIN 인덱스 재사용, 병합 없는 log-only SELECT 함수
- `detectPotentialDuplicate` 헬퍼를 TDD(RED→GREEN)로 구현 — 좌표 부재 시 RPC 미호출, 실좌표(부산 좌표값으로 검증) 시 정확한 인자로 RPC 호출, RPC 에러 시 throw 없이 빈 배열 반환 3케이스 전부 검증
- `scripts/seed-complexes.ts`/`scripts/kapt-enrich.ts`를 코드 변경 없이 실행 — `regions.is_active` 동적 조회 설계(34-00에서 이미 검증)로 부산 16개 구·군이 자동 포함되어 KAPT 단지 1,463건 시딩
- `kapt-enrich.ts`를 10회 반복 실행(PostgREST 1,000행 캡 + 10분 도구 타임아웃 제약 대응)해 부산 si 필드를 1,310건 null → 11건 null로 수렴(99.2% 보강, 나머지는 KAPT API 자체의 데이터 갭)

## Task Commits

1. **Task 1: dup-detection RPC 마이그레이션 작성 + 라이브 적용** - `2d79f00` (feat)
2. **Task 2a: detectPotentialDuplicate 실패 테스트 (RED)** - `8375068` (test)
2. **Task 2b: detectPotentialDuplicate 구현 (GREEN)** - `6e5c7eb` (feat)
3. **Task 3: 부산 KAPT 시딩 + enrich 실행** - 커밋 없음 (plan 명시: "파일: 없음, 기존 스크립트 실행" — 순수 운영 실행, DB 상태 변경만 발생)

## Files Created/Modified
- `supabase/migrations/20260708000001_find_nearby_similar_complexes.sql` - ST_DWithin(반경 30m) + similarity(임계 0.4) 기반 중복 후보 탐지 RPC, 라이브 적용 완료
- `src/lib/data/complex-matching.ts` - `detectPotentialDuplicate` export 함수 추가 (기존 `matchByCoordinate` 패턴 재사용, log-only)
- `src/lib/data/complex-matching.test.ts` - 신규 테스트 파일, 3케이스(좌표 부재/실좌표 호출/RPC 에러) 전부 통과

## Decisions Made
- **detectPotentialDuplicate를 seed-complexes.ts에 배선하지 않음**: KAPT 단지목록 API(`KaptComplexSchema`)에는 좌표(`coordX`/`coordY`) 필드가 없어, 시딩 루프에 dup-check를 넣으면 TS2339 컴파일 에러 + 좌표 null로 인한 항상-스킵이라는 결함이 발생함을 plan-checker가 사전에 발견 — 34-03-PLAN.md가 이미 이를 반영해 RPC+헬퍼만 준비하는 것으로 수정된 상태였고, 이 executor는 그 수정된 계획을 그대로 따름. 실제 좌표 확보(34-05 카카오 지오코딩) 이후 이 헬퍼를 DB 실좌표 row 순회로 호출하는 것이 다음 단계.
- **부산 시딩을 원본 스크립트와 임시 완주 스크립트로 분할 실행**: `npx tsx scripts/seed-complexes.ts`가 10분 Bash 도구 타임아웃 안에 38개 활성 지역(부산 16 + 경남 22) 전체를 처리하지 못해 부산 16개 완료 직후 타임아웃됨. 이미 완료된 부산을 재처리하지 않기 위해 `scripts/_tmp-seed-remaining.ts`(seed-complexes.ts와 동일한 `fetchComplexList`/`seedComplex` 함수 재사용, 남은 22개 경남 코드만 대상)를 임시로 작성해 완주시키고 실행 후 즉시 삭제 — `scripts/` 디렉토리에는 최종적으로 아무 변경 없음(plan의 "files_modified: 없음"과 일치).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `.env.production.local`의 빈 `SUPABASE_SERVICE_ROLE_KEY`가 `@next/env`의 `loadEnvConfig()`에서 `.env.local`의 실제 키보다 우선 로드됨**
- **Found during:** Task 3 (seed-complexes.ts 최초 실행 시도)
- **Issue:** `scripts/seed-complexes.ts`가 `loadEnvConfig(process.cwd())`를 `dev` 인자 없이 호출 → `@next/env`가 기본적으로 production 모드로 판단해 파일 우선순위를 `.env.production.local` → `.env.local` → `.env.production` → `.env` 순으로 적용. `.env.production.local`에 `SUPABASE_SERVICE_ROLE_KEY=""`(빈 문자열)가 정의돼 있어 먼저 로드되며, 이후 `.env.local`의 실제 값을 덮어쓰지 못하는 first-wins 로직 때문에 최종적으로 빈 문자열이 채택됨 → `supabaseKey is required` 에러로 스크립트 즉시 종료
- **Fix:** `scripts/seed-complexes.ts`/`kapt-enrich.ts` 코드는 수정하지 않음(plan 범위 밖, 다른 파일들도 동일 패턴에 의존할 수 있어 광범위한 영향 우려) — 대신 셸에서 `SUPABASE_SERVICE_ROLE_KEY=$(grep ... .env.local | cut -d'=' -f2-)`로 실제 값을 미리 export하여 Node 프로세스 시작 시점에 이미 `process.env`에 설정되도록 함(`loadEnvConfig`는 이미 설정된 값을 덮어쓰지 않는 로직이므로 우선순위 문제 회피)
- **Files modified:** 없음 (실행 시점 셸 환경변수 워크어라운드만 적용)
- **Verification:** `SUPABASE_SERVICE_ROLE_KEY` export 후 `loadEnvConfig` 직접 호출 테스트로 올바른 219자 키가 로드됨을 확인, 이후 모든 스크립트 실행 정상 동작
- **Committed in:** 해당 없음 (커밋 대상 파일 변경 없음)

**2. [Rule 3 - Blocking] 10분 Bash 도구 타임아웃이 38개 지역 전체 처리에 부족**
- **Found during:** Task 3 (seed-complexes.ts, kapt-enrich.ts 실행)
- **Issue:** `seed-complexes.ts`는 부산 16개 지역(1,463건) 처리 완료 직후 22개 경남 지역 처리 도중 10분 타임아웃으로 강제 종료됨. `kapt-enrich.ts`는 PostgREST 1,000행 캡(RESEARCH.md Pitfall 4에서 이미 예견됨) + 외부 KAPT API 호출당 지연시간으로 1회 실행으로 전량(최대 2,671건 대상) 처리 불가
- **Fix:** (a) seed-complexes.ts는 남은 22개 지역만 처리하는 임시 스크립트로 완주 후 삭제(위 "Decisions Made" 참고). (b) kapt-enrich.ts는 idempotent(`WHERE built_year IS NULL`) 특성을 활용해 총 10회 순차 재실행 — 매 회 최대 1,000건(PostgREST 캡) 또는 잔여분을 처리, `busan_si_null` 카운트가 1,310 → 1,175 → 1,091 → 874 → 563 → 301 → 11 → 11(안정)로 수렴할 때까지 반복
- **Files modified:** 없음 (DB 상태 변경만, 코드 변경 없음)
- **Verification:** 최종 `select count(*) from complexes where sgg_code like '26%' and si is null` = 11 (동일 11건이 2회 연속 재실행에서도 변하지 않아 KAPT API 자체의 데이터 갭으로 확정, 재실행으로 해결 불가능함을 확인 — Phase 33의 99.5% 보강률 선례와 동일 패턴)
- **Committed in:** 해당 없음 (Task 3은 코드 변경 없음, DB 상태만 변경)

**3. [Rule 2 - Missing Critical, 발견만] `seedComplex`의 UPDATE 경로가 `built_year`를 무조건 덮어쓰는 기존 동작 확인**
- **Found during:** Task 3 (경남 22개 지역 재시딩 후 kapt-enrich 대상이 예상보다 훨씬 큰 것을 발견)
- **Issue:** `seedComplex()`(src/lib/data/complex-matching.ts, 이 phase에서 수정하지 않은 기존 코드)는 `raw.kaptUseApproveYmd`가 있을 때만 `built_year`를 계산하는데, `fetchComplexList()`가 반환하는 `KaptComplex` 타입에는애초에 이 필드가 없음(`fetchKaptBasicInfo()` 전용 필드). 따라서 기존 22개 경남 지역을 idempotent 재시딩만 해도 매번 `built_year`가 null로 리셋됨 — plan의 "기존 22개 지역은 upsert로 idempotent 재실행(안전)"이라는 가정과 달리 실제로는 built_year 한정 부작용이 있음
- **Fix:** 코드 수정 없음(이 phase 범위 밖 — `seedComplex`는 이미 존재하는 함수이고 이번 plan의 `files_modified`에 포함되지 않음). `kapt-enrich.ts` 반복 실행으로 리셋된 built_year를 전량 재보강 완료(총 2,671건 → 177건 잔여, 대부분 KAPT API 데이터 갭)
- **Files modified:** 없음
- **Verification:** `total_built_year_null` 카운트가 반복 실행마다 감소해 177까지 수렴 확인 (Phase 34-03의 acceptance criteria는 부산 si만 요구하므로 이 잔여는 acceptance 범위 밖이나 투명성을 위해 기록)
- **Committed in:** 해당 없음 — 향후 phase에서 `seedComplex`의 UPDATE 경로가 `built_year`를 조건부로만 갱신하도록 개선하는 것을 권장(이 SUMMARY에 기록, 코드 수정은 하지 않음)

---

**Total deviations:** 3 (2 Rule 3 blocking 워크어라운드, 1 Rule 2 기존 동작 발견·기록만)
**Impact on plan:** 전부 실행 환경/도구 제약(10분 타임아웃, env 파일 우선순위) 대응이며 plan이 지정한 파일 범위(`supabase/migrations/20260708000001_...sql`, `src/lib/data/complex-matching.ts`, `src/lib/data/complex-matching.test.ts`)를 벗어나지 않음. 코드 변경 없이 계획대로 완료.

## Issues Encountered
- 부산 1,463건 중 11건(0.75%)이 KAPT `fetchKaptBasicInfo` API에서 지속적으로 null을 반환해 si/household_count 미보강 상태로 남음 — Phase 33 경남 확장의 ~99.5% 보강률과 동일한 패턴(KAPT 자체 데이터 갭, 최근 준공/소규모 임대주택 등으로 추정). 해당 11건 목록: 공항마을 리베르하임(26440), 광안KCC스위첸하버뷰·광안경동리인·광안비치올리브씨아파트(26500), 기장포스코더샵아파트(26710), 당리삼창아파트(26380), 명지행복주택(26440), 부산연산행복주택·연산예서두레라움(26470), 솔내음파미유(26230), 장산마을(26350). 후속 phase에서 KAPT 상세정보 API 재시도 또는 수동 보강 검토 가능하나 이 phase 범위 밖.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `find_nearby_similar_complexes` RPC가 라이브에 적용되어 34-05(카카오 지오코딩)가 좌표 확보 직후 `detectPotentialDuplicate` 헬퍼로 중복 탐지 로그를 남길 준비가 됨
- 부산 16개 구·군 Golden Record(complexes) 1,463건이 시딩 완료되어 34-06(국토부 실거래가 백필) 착수 전 매칭 기반이 마련됨 — si 99.2% 보강(잔여 11건은 KAPT API 데이터 갭으로 별도 조치 불필요)
- `scripts/seed-failures.csv`는 이번 세션 실행으로 갱신되지 않음(기존 4월 30일자 파일 그대로, 이번 세션 실패 없음 확인됨)

---
*Phase: 34-db-2*
*Completed: 2026-07-09*
