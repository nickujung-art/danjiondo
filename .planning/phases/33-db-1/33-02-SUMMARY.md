---
phase: 33-db-1
plan: "02"
subsystem: rankings
tags: [rankings, regions, refactor, landing-page]

# Dependency graph
requires: ["33-00"]
provides:
  - "rankings.ts computeRankings 4종 집계 함수가 regions 테이블 기반 동적 조회로 sgg_code 필터링"
  - "rankings-page.ts 7개 export 함수(랜딩 페이지 실거래 피드·대장단지·주간 하이라이트 등)가 동적 지역 필터 사용"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "rankings.ts/rankings-page.ts: 각 함수/루프 시작부에서 getActiveSggCodes(supabase) 1회 호출 후 activeSggCodes 배열을 .in() 필터에 전달 — 33-00에서 확정된 regions 동적 조회 공용 헬퍼 패턴 계승"

key-files:
  created: []
  modified:
    - src/lib/data/rankings.ts
    - src/lib/data/rankings-page.ts

key-decisions:
  - "CHAMPION_REGIONS(rankings-page.ts) 유지 — 지역 필터 allowlist가 아니라 '대장단지 구별 정의' UI용 6개 sub-region 표시 목록. CONTEXT.md의 UI 구조 변경 없음 원칙에 따라 plan 명세대로 변경하지 않음"
  - "getRegionalPriceRanking/getRegionalAllTimeHighs는 getActiveSggCodes() 호출을 추가하지 않음 — 이 두 함수는 원래부터 ACTIVE_SGG_CODES를 전혀 참조하지 않고, caller(rankings/page.tsx)가 REGION_TABS 기반 sggCodes를 파라미터로 전달하는 구조. REGION_TABS도 CHAMPION_REGIONS와 동일한 성격의 UI 탭 정의(6개 sub-region)라 이번 phase의 UI 동결 원칙 대상. 불필요한 getActiveSggCodes() 호출을 추가하면 미사용 변수로 lint 에러가 발생하므로 실제 코드 구조에 맞춰 5개 함수만 수정"
  - "computeRankings의 aggregators 루프: getActiveSggCodes(supabase)를 함수 시작부에서 1회만 호출하고 4개 집계 함수에 파라미터로 전달 — 요청당 regions 쿼리 1회로 제한"

requirements-completed: [REGION-03]

# Metrics
duration: ~15min
completed: 2026-07-03
---

# Phase 33 Plan 02: rankings.ts·rankings-page.ts 동적 지역 필터 전환 Summary

**랜딩 페이지 랭킹 4종(신고가·거래량·평당가·관심도) 집계와 구별 챔피언·주간 하이라이트 등 rankings-page.ts 7개 함수 중 5개의 `ACTIVE_SGG_CODES` 하드코딩 배열을 `getActiveSggCodes()` 동적 조회로 교체했다.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2/2 완료
- **Files modified:** 2

## Accomplishments

- `src/lib/data/rankings.ts`: `ACTIVE_SGG_CODES` 정적 배열 완전 제거. `aggregateHighPrice`/`aggregateVolume`/`aggregatePricePerPyeong`/`aggregateInterest` 4개 함수가 `activeSggCodes: string[]` 파라미터를 받도록 시그니처 변경. `computeRankings`가 요청당 `getActiveSggCodes(supabase)`를 1회 호출해 4개 집계 함수에 전달
- `src/lib/data/rankings-page.ts`: `ACTIVE_SGG_CODES` 정적 배열 완전 제거. `getRecentDailyFeed`, `getChampionComplexes`, `getWeeklyHighlights`, `getNewRecordCount`, `getRegionalTradingHeat` 5개 함수 본문에 `const activeSggCodes = await getActiveSggCodes(supabase)`를 추가하고 모든 `.in('sgg_code'|'complexes.sgg_code', [...ACTIVE_SGG_CODES])` 호출을 `activeSggCodes`로 치환
- `CHAMPION_REGIONS`는 plan 명세대로 변경 없이 유지 확인 (대장단지 구별 UI 표시 목록, allowlist 아님)
- `npx tsc --noEmit`, `npx eslint`, `npx vitest run src/__tests__/rankings.test.ts` (6/6 통과) 모두 정상

## Task Commits

Each task was committed atomically:

1. **Task 1: rankings.ts 집계 함수 4종 동적 지역 필터 전환** - `497b717` (feat)
2. **Task 2: rankings-page.ts 7개 함수 동적 지역 필터 전환** (실제로는 5개 함수 수정 — 아래 Deviations 참고) - `61491a7` (feat)

## Files Created/Modified

- `src/lib/data/rankings.ts` - `ACTIVE_SGG_CODES` 제거, 4개 집계 함수 시그니처 변경, `computeRankings`에서 동적 조회 1회 호출
- `src/lib/data/rankings-page.ts` - `ACTIVE_SGG_CODES` 제거, 5개 export 함수 본문에 동적 조회 추가

## Deviations from Plan

### 1. [Acceptance criteria 불일치] rankings-page.ts에서 getActiveSggCodes(supabase) 호출 5회 (plan 요구 >= 7)

- **발견 시점:** Task 2 구현 중 원본 파일의 `ACTIVE_SGG_CODES` 실제 참조 위치를 grep으로 재확인할 때
- **이슈:** plan의 acceptance_criteria는 `getRegionalPriceRanking`, `getRegionalAllTimeHighs`를 포함한 7개 함수 모두에 `getActiveSggCodes(supabase)` 호출을 요구했으나(`grep -c ... >= 7`), 실제 원본 코드를 확인한 결과 이 두 함수는 애초에 `ACTIVE_SGG_CODES`를 전혀 참조하지 않음 — `getRegionalPriceRanking(supabase, sggCodes)`, `getRegionalAllTimeHighs(supabase, sggCodes)` 둘 다 caller(`rankings/page.tsx`)가 `REGION_TABS`(6개 sub-region 탭 정의, 김해/의창구 등)에서 만든 `sggCodes` 배열을 파라미터로 이미 받고 있음. `ACTIVE_SGG_CODES` 실사용 위치는 grep 결과 5곳(`getRecentDailyFeed`, `getChampionComplexes`, `getWeeklyHighlights`×3, `getNewRecordCount`, `getRegionalTradingHeat`)뿐이었음
- **판단:** `REGION_TABS`는 `CHAMPION_REGIONS`와 동일한 성격의 "UI 탭 정의용 6개 sub-region 하드코딩"으로, plan 자체가 `CHAMPION_REGIONS`는 명시적으로 유지하라고 지시한 원칙(재기획 동결·UI 구조 변경 없음)이 그대로 적용됨. 두 함수에 사용하지 않는 `getActiveSggCodes(supabase)` 호출을 강제로 추가하면 미사용 변수로 `eslint` 에러가 발생하므로, 실제 코드 필요에 맞춰 5개 함수만 수정
- **영향 평가:** plan의 실질 목표("computeRankings 4종 + rankings-page 함수들이 경남 신규 시군구 거래를 랭킹/집계에 포함")는 100% 달성됨 — `ACTIVE_SGG_CODES` 상수 자체가 파일에서 완전히 제거되었고, 실제로 지역 필터링에 사용되던 모든 위치가 동적 조회로 전환됨. `getActiveSggCodes(supabase)` 호출 횟수만 plan 명세(>=7)에 못 미침(5회)
- **커밋:** `61491a7`

### 그 외

None — 나머지 태스크는 plan 그대로 실행됨.

## Issues Encountered

None.

## User Setup Required

None — 외부 서비스 설정 불필요.

## Next Phase Readiness

- 랜딩 페이지 랭킹(신고가·거래량·평당가·관심도), 구별 챔피언, 주간 하이라이트, 전일 신고건수, 구별 거래 온도가 모두 경남 신규 시군구 거래를 포함하도록 전환 완료
- `getRegionalPriceRanking`/`getRegionalAllTimeHighs`가 사용하는 `REGION_TABS`(6개 sub-region 탭)와 `CHAMPION_REGIONS`는 여전히 창원 5구+김해로 고정 — 경남 신규 지역을 이 UI 탭에 노출하려면 별도 UI 구조 변경 phase 필요 (재기획 회의 결과 대기 중이므로 이번 phase 범위 밖으로 명시적 유지)
- 블로커 없음

---
*Phase: 33-db-1*
*Completed: 2026-07-03*

## Self-Check: PASSED

Both modified files verified present on disk; both task commit hashes (`497b717`, `61491a7`) verified in `git log --oneline`.
