---
phase: 33-db-1
plan: "03"
subsystem: database
tags: [cron, molit, cheongyak, offi, regions, tdd]

# Dependency graph
requires:
  - phase: 33-00
    provides: "regions 테이블 경남 22개 시군구 시딩 + getActiveSggCodes()/getActiveCityNames() 공용 동적 조회 헬퍼"
provides:
  - "cron/daily/route.ts가 activeSggCodes(getActiveSggCodes) 단일 소스로 분양권전매·오피스텔 루프를 실행"
  - "cheongyak/client.ts의 fetchCheongyakList/fetchRemndrList가 cities 파라미터로 동적 필터링 가능 (기본값 하위 호환 유지)"
  - "cron/daily/route.ts가 getActiveCityNames로 청약홈/잔여세대 수집에 경남 신규 시군구 도시명 전달"
affects: [33-07, 33-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cron/daily/route.ts 상단에서 activeSggCodes/activeCityNames를 1회 조회해 여러 수집 루프가 공유 (중복 regions 쿼리 방지)"

key-files:
  created: []
  modified:
    - src/services/molit-presale.ts
    - src/services/cheongyak/client.ts
    - src/services/cheongyak/client.test.ts
    - src/app/api/cron/daily/route.ts

key-decisions:
  - "LAWD_CODES 제거로 기존 버그(마산합포구 48125+김해 48250 2개만 포함, 창원 4개 구 누락)도 함께 해소됨을 기록"
  - "CHEONGYAK_CITIES는 하위 호환 기본값으로 유지 — fetchCheongyakList()/fetchRemndrList() 인자 없는 호출은 기존 창원·김해 필터링 동작 그대로 보존"
  - "cron 파일 상단 supabase 클라이언트 생성 직후 activeSggCodes 1회 선언 — 분양권전매·오피스텔 루프가 동일 소스 공유(중복 하드코딩 배열 통합)"

patterns-established:
  - "서비스 어댑터 함수의 지역 하드코딩 상수를 optional 파라미터(기본값=기존 상수)로 전환 → 하위 호환 유지하며 caller가 동적 값 주입 가능"

requirements-completed: [REGION-04]

# Metrics
duration: 8min
completed: 2026-07-03
---

# Phase 33 Plan 03: cron 지역 하드코딩 3곳(LAWD_CODES/offiSggCodes/CHEONGYAK_CITIES) 동적 전환 Summary

**cron/daily/route.ts와 하위 서비스 어댑터(molit-presale.ts, cheongyak/client.ts)의 지역 하드코딩 3곳을 regions 테이블 기반 동적 조회로 전환, 분양권전매·오피스텔·청약홈 수집이 경남 신규 16개 시군구까지 확장됨.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-03T15:03:08+09:00
- **Completed:** 2026-07-03T15:05:44+09:00
- **Tasks:** 2/2 완료
- **Files modified:** 4

## Accomplishments
- `molit-presale.ts`의 `LAWD_CODES`(창원 마산합포구+김해 2개만 포함하던 기존 버그성 하드코딩) 완전 제거
- `cron/daily/route.ts`에 `getActiveSggCodes(supabase)` 1회 조회 도입, 분양권전매·오피스텔 두 루프가 동일한 `activeSggCodes` 단일 소스를 공유하도록 통합(기존에 각각 다른 배열로 하드코딩되어 있던 문제 해결)
- `cheongyak/client.ts`의 `fetchCheongyakList`/`fetchRemndrList`를 TDD(RED→GREEN)로 `cities: readonly string[]` 파라미터화, 기본값(`CHEONGYAK_CITIES`=창원·김해)은 하위 호환 유지
- `cron/daily/route.ts`에 `getActiveCityNames(supabase)` 도입, 청약홈 분양공고·잔여세대 수집 양쪽에 `activeCityNames` 전달 — 경남 신규 시군구 청약홈 공고도 수집 대상 포함

## Task Commits

Each task was committed atomically:

1. **Task 1: molit-presale.ts + cron/daily/route.ts 동적 지역 필터 전환 (LAWD_CODES + offiSggCodes 통합)** - `e5965ca` (refactor)
2. **Task 2: 청약홈 어댑터 CHEONGYAK_CITIES 동적 파라미터화** - TDD 2단계:
   - RED: `4080f48` (test) — 커스텀 cities 필터 실패 테스트 추가, 실행 결과 실패 확인(기존 코드가 기본값으로만 필터링해 2건 반환, 기대값 1건과 불일치)
   - GREEN: `1e8c2fb` (feat) — cities 파라미터화 구현, 7개 테스트 전부 통과
   - REFACTOR: 불필요(코드가 이미 단순함, 별도 커밋 없음)

## Files Created/Modified
- `src/services/molit-presale.ts` - `LAWD_CODES` export 제거
- `src/services/cheongyak/client.ts` - `fetchCheongyakList`/`fetchRemndrList` 시그니처에 `cities: readonly string[] = CHEONGYAK_CITIES` 파라미터 추가, 필터링 로직을 `cities` 변수 참조로 변경
- `src/services/cheongyak/client.test.ts` - "커스텀 cities 배열로 필터링 가능" 테스트 1건 추가(기존 4개 테스트는 무변경)
- `src/app/api/cron/daily/route.ts` - `LAWD_CODES` import 제거, `getActiveSggCodes`/`getActiveCityNames` import 추가, `activeSggCodes`/`activeCityNames`를 상단에서 1회 조회해 4개 수집 섹션(분양권전매·오피스텔·청약홈·잔여세대)에서 재사용, 인라인 `offiSggCodes` 배열 삭제

## Decisions Made
- `LAWD_CODES` 제거로 기존에 존재하던 실수(마산합포구 48125 + 김해 48250 2개만 포함, 창원 4개 구 나머지·의창구/성산구/진해구/합포구 외 지역 전혀 누락)도 함께 해소됨을 기록 — 동적 전환이 단순 리팩터를 넘어 실질적 버그 수정 효과를 가짐
- `CHEONGYAK_CITIES`는 삭제하지 않고 하위 호환 기본값으로 유지 — 기존 client.test.ts의 인자 없는 호출 테스트(4건)가 수정 없이 그대로 통과해야 한다는 계약을 지킴
- cron 파일에서 `activeSggCodes`/`activeCityNames`를 각 수집 섹션마다 재조회하지 않고 상단에서 1회만 조회 — regions 테이블 쿼리 중복 방지(성능/일관성)

## Deviations from Plan

None - plan executed exactly as written. Plan이 명시한 3개 하드코딩 지점(LAWD_CODES, offiSggCodes, CHEONGYAK_CITIES)을 정확히 그대로 처리했고, acceptance_criteria(grep 카운트)와 verify 커맨드가 모두 계획대로 통과함.

## Issues Encountered

None.

## TDD Gate Compliance

Task 2는 `tdd="true"`로 지정된 태스크. Git log 확인 결과:
1. RED gate: `4080f48` (`test(33-03): 청약홈 fetchCheongyakList 커스텀 cities 필터 실패 테스트 추가`) — 신규 테스트 실행 결과 실패 확인 후 커밋
2. GREEN gate: `1e8c2fb` (`feat(33-03): 청약홈 fetchCheongyakList/fetchRemndrList cities 파라미터화`) — 구현 후 7개 테스트 전부 통과 확인 후 커밋
3. REFACTOR gate: 해당 없음 — 구현이 이미 간결하여 별도 리팩터 불필요

RED→GREEN 순서 정상 준수. 경고 없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `cron/daily/route.ts`의 지역 하드코딩 3곳(LAWD_CODES, offiSggCodes, CHEONGYAK_CITIES 필터링) 전부 regions 테이블 기반 동적 조회로 전환 완료 — 33-db-1 Wave 1의 9곳 하드코딩 제거 목표 중 3곳 완료
- 다음 일배치 cron 실행부터 경남 신규 16개 시군구의 분양권전매·오피스텔·청약홈 데이터가 자동 수집됨(코드 변경만으로 즉시 반영, 별도 배포 후 조치 불필요)
- 블로커 없음 — Wave 1 나머지 plan(33-01 완료, 33-02 완료, 33-04~33-06, 33-09, 33-10)과 독립적으로 병렬 진행 가능

---
*Phase: 33-db-1*
*Completed: 2026-07-03*

## Self-Check: PASSED

All 4 modified source files verified present on disk; all 3 task commit hashes (`e5965ca`, `4080f48`, `1e8c2fb`) verified in `git log`.
