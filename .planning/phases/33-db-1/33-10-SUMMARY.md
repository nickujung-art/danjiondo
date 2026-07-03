---
phase: 33-db-1
plan: "10"
subsystem: database
tags: [supabase, regions, molit, officetel, unsold, data-layer, tsx-scripts]

# Dependency graph
requires:
  - phase: 33-db-1
    provides: "33-00의 regions 테이블 경남 전체 22개 시군구 시딩 + getActiveSggCodes/getActiveCityNames 공용 헬퍼"
provides:
  - "src/lib/data/regions.ts — getActiveRegionAddrs() 신규 공용 헬퍼 (sgg_code/si/gu is_active=true 전체 조회)"
  - "molit-unsold.ts resolveSggCode가 CHANGWON_GU_MAP 정적 배열 대신 regions 배열 파라미터 기반 동적 판별로 전환"
  - "realprice-officetel.ts getOrCreateOffiComplex가 SGG_TO_ADDR 정적 배열 대신 regionAddrMap 기반 동적 si/gu 조회로 전환"
  - "regions.ts의 server-only 가드 제거 — Node 스크립트(tsx)에서 직접 import 가능"
affects: [33-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "regions 테이블 (sgg_code, si, gu) 풀 로우 동적 조회 — sgg_code→주소 역매칭이 필요한 어댑터/데이터 레이어에 재사용 가능한 패턴"
    - "server-only 가드는 scripts/에서 tsx로 직접 import되는 src/lib/data/*.ts 파일에는 적용 불가 (kapt.ts 33-06 선례와 동일 결론)"

key-files:
  created:
    - src/services/molit-unsold.test.ts
  modified:
    - src/lib/data/regions.ts
    - src/services/molit-unsold.ts
    - scripts/fetch-regional-unsold.ts
    - src/lib/data/realprice-officetel.ts

key-decisions:
  - "resolveSggCode(item, regions) 시그니처로 규 — 어댑터(src/services/)는 순수 함수 유지, DB 조회는 호출자(scripts/fetch-regional-unsold.ts)가 주입 (CLAUDE.md 계층 규칙)"
  - "regions.ts의 import 'server-only' 제거 — scripts/(fetch-regional-unsold.ts, backfill-officetel.ts)에서 tsx 직접 실행 시 무조건 throw하던 pre-existing 버그, kapt.ts 33-06 fix(7be9031)와 동일 패턴 적용"

patterns-established:
  - "getActiveRegionAddrs(): sgg_code→{si,gu} 역매칭이 필요한 모든 신규 어댑터/데이터 레이어가 재사용할 단일 소스"

requirements-completed: [REGION-11]

# Metrics
duration: 9min
completed: 2026-07-03
---

# Phase 33 Plan 10: molit-unsold.ts + realprice-officetel.ts regions 동적 조회 전환 Summary

**CHANGWON_GU_MAP(molit-unsold.ts)과 SGG_TO_ADDR(realprice-officetel.ts) 두 하드코딩 배열을 regions 테이블 기반 동적 조회(`getActiveRegionAddrs`)로 대체하여, 경남 신규 16개 시군구의 월별 미분양현황 집계와 오피스텔 자동 생성 시 si/gu 정합성 문제를 해소했다.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-03T16:20:47+09:00 (33-09 완료 직후)
- **Completed:** 2026-07-03T16:29:58+09:00
- **Tasks:** 2/2 완료
- **Files modified:** 5 (1 created 신규, 4 수정)

## Accomplishments
- `src/lib/data/regions.ts`에 `getActiveRegionAddrs()` 신규 함수 추가 — `CHANGWON_GU_MAP`/`SGG_TO_ADDR` 등 정적 시군구 주소 매핑 배열을 대체하는 단일 소스 확정
- `molit-unsold.ts`의 `resolveSggCode`가 regions 배열 파라미터 기반으로 si 후보를 좁히고(다중 gu 후보 시 rdnmadr로 특정) 동적 판별 — 경남 신규 16개 시군구가 매월 미분양현황 집계에 자동 포함됨
- `realprice-officetel.ts`의 `getOrCreateOffiComplex`가 `ingestOffiMonth`당 1회 조회한 `regionAddrMap` 기반으로 si/gu 결정 — 신규 지역 오피스텔 자동 생성 시 si/gu가 더 이상 null로 떨어지지 않음
- `molit-unsold.test.ts` 신규 작성 — TDD RED(경남 신규 시군구 회귀 케이스 실패 확인) → GREEN(5개 테스트 전부 통과) 사이클 완료

## Task Commits

Each task was committed atomically:

1. **Task 1: molit-unsold.ts + fetch-regional-unsold.ts regions 테이블 동적 조회 전환 (CHANGWON_GU_MAP 제거)** - `73ce164` (test, RED) → `c80f4e6` (feat, GREEN)
2. **Task 2: realprice-officetel.ts regions 테이블 동적 조회 전환 (SGG_TO_ADDR 제거)** - `6f11198` (feat, deviation 포함)

_TDD 태스크(Task 1)는 test → feat 2개 커밋. Task 2는 tdd 미지정이나 실행 중 발견된 pre-existing 버그 수정을 같은 커밋에 포함._

## Files Created/Modified
- `src/lib/data/regions.ts` - `getActiveRegionAddrs()` 신규 추가(sgg_code/si/gu is_active=true 전체 조회), `import 'server-only'` 제거(deviation)
- `src/services/molit-unsold.ts` - `CHANGWON_GU_MAP` 제거, `resolveSggCode(item, regions)`로 시그니처 변경(regions 파라미터 기반 동적 역매칭)
- `src/services/molit-unsold.test.ts` (신규) - Vitest 5개 테스트: 창원 다중 gu 후보, 김해 단일 gu=null 후보, 경남 신규 시군구(진주시) 회귀 방지, 범위 외 지역, 구 미특정
- `scripts/fetch-regional-unsold.ts` - `getActiveRegionAddrs()` import + 호출, `resolveSggCode(item, regionAddrs)`로 주입 방식 변경
- `src/lib/data/realprice-officetel.ts` - `SGG_TO_ADDR` 제거, `getOrCreateOffiComplex`에 `regionAddrMap` 파라미터 추가, `ingestOffiMonth`가 호출당 1회 `getActiveRegionAddrs()` 조회 후 두 호출부(`processSaleItem`/`processRentItem`)에 주입

## Decisions Made
- `resolveSggCode`를 순수 함수로 유지하고 regions 조회는 호출자(스크립트)가 주입하는 방식 채택 — CLAUDE.md의 "외부 API 어댑터는 `src/services/` 전용, DB 조회는 분리" 계층 규칙 준수
- `regions.ts`의 `server-only` 가드를 제거 — 계획에는 없었으나 Task 1/2 양쪽 모두 scripts/에서 tsx로 직접 `getActiveRegionAddrs`를 import해야 하는데, 이 마커가 Node 실행 환경(exports 조건 `react-server` 미해당)에서 무조건 throw하여 스크립트 실행 자체를 차단하는 pre-existing 버그였음. `kapt.ts`의 동일 문제(33-06, 커밋 7be9031)와 완전히 같은 원인·해법이라 동일 패턴 적용.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `resolveSggCode`의 noUncheckedIndexedAccess strict 위반 수정**
- **Found during:** Task 1 (GREEN 단계 tsc 검증)
- **Issue:** `candidates[0].sgg_code`가 TS strict(`noUncheckedIndexedAccess`) 하에서 `Object is possibly 'undefined'` 에러 발생
- **Fix:** `candidates[0]?.sgg_code ?? null`로 옵셔널 체이닝 적용
- **Files modified:** `src/services/molit-unsold.ts`
- **Verification:** `npx tsc --noEmit` 에러 0건, 5개 테스트 전부 통과
- **Committed in:** `c80f4e6` (Task 1 GREEN 커밋)

**2. [Rule 3 - Blocking] `regions.ts`의 `server-only` 가드가 Node 스크립트 실행을 차단하던 pre-existing 버그 수정**
- **Found during:** Task 2 (구현 직후, `npx tsx`로 import 검증 시)
- **Issue:** `src/lib/data/regions.ts`에 있던 `import 'server-only'`가 `scripts/fetch-regional-unsold.ts`(Task 1에서 신규로 `getActiveRegionAddrs` import 추가)와 `scripts/backfill-officetel.ts`(realprice-officetel.ts를 통해 간접 의존)에서 tsx 실행 시 exports 조건(`react-server` 미해당) 불일치로 무조건 throw — 두 스크립트 모두 실행 자체가 불가능한 상태였음
- **Fix:** `kapt.ts`의 동일 문제(33-06, 커밋 7be9031)와 동일한 해법 적용 — `server-only` import를 제거하고 사유 주석으로 대체. `regions.ts` 소비처를 grep으로 재확인(API route, RSC 서버 컴포넌트 페이지, scripts — 클라이언트 컴포넌트 사용 없음)하여 노출 리스크 없음을 검증
- **Files modified:** `src/lib/data/regions.ts`
- **Verification:** `npx tsx scripts/_tmp-check-regions.ts`(임시 검증 스크립트)로 `getActiveRegionAddrs`/`getActiveSggCodes`/`getActiveCityNames` 3개 함수가 모두 정상 resolve됨을 확인 후 삭제. `npx tsc --noEmit` 전체 프로젝트 에러 0건
- **Committed in:** `6f11198` (Task 2 커밋)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** 둘 다 계획된 작업(Task 1/2)을 완료하기 위해 반드시 필요한 수정. Rule 2의 `server-only` 제거는 33-06에서 이미 검증된 동일 패턴을 재적용한 것이라 리스크 낮음. Scope creep 없음.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `getActiveRegionAddrs()`가 `src/lib/data/regions.ts`의 공용 계약으로 확정되어, 향후 sgg_code→주소 역매칭이 필요한 신규 어댑터/스크립트가 즉시 재사용 가능
- `regions.ts`의 `server-only` 가드 제거로 Node 스크립트(tsx) 생태계 전반의 잠재적 동일 버그(33-11 이후 plan에서 regions.ts를 신규로 import하는 스크립트가 있다면) 사전 해소됨
- 33-CONTEXT.md addendum의 Task 3(backfill-officetel.ts SGG_CODES)은 오케스트레이터가 사전 처리 완료 — 이 plan의 실행 범위 밖
- 블로커 없음

---
*Phase: 33-db-1*
*Completed: 2026-07-03*

## Self-Check: PASSED

All created/modified files verified present on disk; all four task commit hashes (`73ce164`, `c80f4e6`, `6f11198`) verified in `git log`.
