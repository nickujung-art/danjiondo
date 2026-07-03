---
phase: 33-db-1
plan: "06"
subsystem: database
tags: [kapt, complexes, golden-record, seed, gyeongnam-expansion]

# Dependency graph
requires: ["33-00"]
provides:
  - "complexes 테이블에 경남 신규 16개 시군구 단지 788건 KAPT API 기준 시딩 완료"
  - "신규 788건 중 784건(99.5%)의 si/gu/dong/road_address/household_count/built_year 보강 완료"
affects: ["33-07"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "kapt.ts에서 'server-only' 마커 제거 — naver-land.ts/presale-crawler.ts와 동일하게 scripts/ 직접 import 허용 패턴으로 통일"

key-files:
  created: []
  modified:
    - src/services/kapt.ts

key-decisions:
  - "kapt.ts의 'server-only' import(2026-06-19 커밋 1d309bc 추가분)를 제거 — 클라이언트 컴포넌트에서 전혀 import되지 않는 상태(grep 검증)에서 Node/tsx exports 조건 불일치로 무조건 throw하여 kapt.ts를 import하는 스크립트 6개(seed-complexes.ts, kapt-enrich.ts 등) 전부와 kapt-enrich-once.yml CI 워크플로를 차단하고 있던 pre-existing 버그. Rule 1/3 적용 — 현재 태스크 완료를 직접 차단하는 블로커였으므로 사용자 확인 없이 즉시 수정"
  - "kapt-enrich.ts는 Supabase 기본 쿼리 제한(1,000행)으로 1회 실행당 최대 1,000건만 처리 — WHERE built_year IS NULL idempotent 조건을 활용해 3회 반복 실행으로 수렴 확인(1000→464→19→6 잔여, 신규 지역 기준 788→4로 안정화)"
  - "신규 지역 788건 중 4건(옥봉대림아파트/도남주공아파트/산청옥산LH아파트/합천핫들LH아파트)은 3회 재시도에도 K-apt BasicInfo API가 지속적으로 null을 반환 — 코드 버그가 아닌 K-apt API 자체의 데이터 공백(단지목록 API엔 존재하나 상세정보 API엔 없는 케이스)으로 판단, 재처리 루프에 남겨둠(built_year IS NULL 조건 유지로 향후 API 데이터 보강 시 자동 재시도됨)"

requirements-completed: [REGION-01]

# Metrics
duration: ~50min
completed: 2026-07-03
---

# Phase 33 Plan 06: 경남 신규 16개 시군구 Golden Record(complexes) KAPT 시딩 Summary

**KAPT 단지목록 API로 경남 신규 16개 시군구에 788개 단지를 `complexes` 테이블에 신규 시딩하고, 그중 784건(99.5%)의 si/gu/dong/road_address/household_count/built_year를 K-apt 상세정보 API로 보강했다. 실행 중 `kapt.ts`의 pre-existing `server-only` import 버그(스크립트 6개+CI 워크플로 전체 실행 차단)를 발견·수정했다.**

## Performance

- **Duration:** ~50 min (스크립트 실행 3회 반복 포함, KAPT API rate limit 100ms/건 방어 대기 포함)
- **Completed:** 2026-07-03
- **Tasks:** 2/2 완료
- **Files modified:** 1 (src/services/kapt.ts — 블로킹 버그 수정)

## Accomplishments

- `scripts/seed-complexes.ts`를 API 모드("Bootstrap 모드" 미출력 확인)로 실행 — 경남 22개 시군구(기존 6 + 신규 16) 전체 순회, 총 1,459건 upsert
  - 신규 16개 시군구: **788건** 신규 시딩 (진주 167, 통영 83, 사천 54, 밀양 45, 거제 148, 양산 191, 의령 4, 함안 21, 창녕 14, 고성 16, 남해 4, 하동 8, 산청 4, 함양 9, 거창 17, 합천 3)
  - 기존 6개 시군구(창원 5구+김해): 671건 (idempotent upsert로 재확인, 기존 데이터 보존)
  - `complexes` 테이블 총 행 수: 2,031 → 2,822 (+791, 신규 지역 788건 + 기존 지역 upsert 중 신규 발견 3건)
- `scripts/kapt-enrich.ts`를 3회 반복 실행(WHERE built_year IS NULL idempotent 조건, Supabase 1,000행 쿼리 제한으로 1회당 최대 1,000건 처리) — 신규 지역 788건 중 **784건(99.5%)**의 si/gu/dong/road_address/household_count/built_year/heat_type 보강 완료
  - Pass 1: 1,000건 중 996 성공/4 실패
  - Pass 2: 464건 중 446 성공/18 실패
  - Pass 3: 19건 중 13 성공/6 실패 (수렴 확인 — 신규 지역 기준 잔여 4건으로 안정화, 재실행해도 동일 4건 유지)
  - 최종 잔여 4건(옥봉대림아파트/도남주공아파트/산청옥산LH아파트/합천핫들LH아파트)은 K-apt BasicInfo API의 지속적 null 응답 — 코드 문제 아님, 데이터 공백으로 판단
- pre-existing 블로킹 버그 발견·수정: `src/services/kapt.ts`의 `import 'server-only'`가 Node/tsx 스크립트 실행을 전면 차단하고 있던 것을 확인, 제거

## Task Commits

Each task was committed atomically:

1. **Task 1: KAPT 단지목록 API로 경남 신규 시군구 Golden Record 시딩** - `7be9031` (fix — 블로킹 버그 수정만 커밋 대상, 스크립트 실행 자체는 코드 변경 없음)
2. **Task 2: K-apt 상세정보 enrich 실행** - 코드 변경 없음(순수 스크립트 실행, 커밋 대상 파일 없음). 결과는 본 SUMMARY 및 `complexes` 테이블에 직접 반영됨

## Files Created/Modified

- `src/services/kapt.ts` - `import 'server-only'` 제거 (Rule 1/3 블로킹 버그 수정, Deviations 참고)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Blocking Bug] kapt.ts의 `server-only` import가 Node 스크립트 6개 + CI 워크플로 전체 실행을 차단**
- **Found during:** Task 1 첫 실행 시도(`npx tsx scripts/seed-complexes.ts`)
- **Issue:** 2026-06-19 커밋(`1d309bc`, "chore: server-only import 추가")에서 클라이언트 번들 노출 방지 목적으로 `src/services/kapt.ts`에 `import 'server-only'`가 추가됨. 그러나 `server-only` 패키지는 `exports` 조건(`react-server`)이 맞는 번들러(webpack/Next.js)에서만 안전하게 no-op 처리되고, Node/tsx로 직접 실행 시에는 `default` export(무조건 throw)가 로드되어 `Error: This module cannot be imported from a Client Component module`을 던짐. `grep -rn "services/kapt'"` 전수 검증 결과 kapt.ts는 `src/app/api/cron/daily/route.ts`(서버 전용 API Route)와 테스트 파일들 외에 **클라이언트 컴포넌트에서 전혀 import되지 않음** — 즉 이 가드는 실제 보호 대상이 없는 상태에서 `scripts/seed-complexes.ts`, `scripts/kapt-enrich.ts`, `scripts/backfill-jibun-addr.ts`, `scripts/kapt-code-lookup.ts`, `scripts/kapt-household-refetch.ts`, `scripts/kapt-building-count-fetch.ts`, `scripts/kapt-facility-enrich.ts` 등 7개 스크립트와 `.github/workflows/kapt-enrich-once.yml`/`kapt-facility-enrich-once.yml` CI 워크플로의 실행을 전부 차단하고 있었음(이번 Task 1을 실행하기 전까지 발견되지 않은 잠복 버그)
- **Fix:** `naver-land.ts`/`presale-crawler.ts`에 이미 존재하는 프로젝트 관례(server-only 명시적 생략 + 사유 주석)를 그대로 적용하여 `import 'server-only'` 제거, 대체 설명 주석 추가
- **Files modified:** `src/services/kapt.ts`
- **Commit:** `7be9031`
- **검증:** `npx tsc --noEmit --pretty false` 0 errors, `npx vitest run src/services/kapt.test.ts src/__tests__/kapt-enrich.test.ts` 14/14 통과, `npm run lint` — 신규 에러 없음(기존 5건은 33-00에서 이미 deferred 처리된 무관 파일)

### Other Notes (not deviations — expected script behavior)

- `scripts/kapt-enrich.ts`가 Supabase JS 클라이언트의 기본 쿼리 행 제한(1,000)으로 인해 1회 실행당 최대 1,000건만 처리하도록 설계되어 있음(스크립트 자체의 알려진 제약, 코드 결함 아님) — plan의 `<verify>` 지시대로 `npx tsx scripts/kapt-enrich.ts` 단일 실행 커맨드를 그대로 따르되, idempotent(`WHERE built_year IS NULL`) 특성을 활용해 잔여 건수가 안정화(4건 고정)될 때까지 3회 반복 실행 — plan 문면상 명시적 반복 지시는 없었으나 acceptance_criteria("si is null 결과가 실행 전보다 감소함")를 최대한 충족시키기 위한 합리적 실행 방식으로 판단, 별도 코드 변경 없이 동일 스크립트 재실행이므로 Rule 4(아키텍처 변경) 대상 아님

## Known Stubs

없음 — 이 plan은 데이터 시딩/보강 작업만 수행, UI/컴포넌트 변경 없음.

## Threat Flags

없음 — 신규 네트워크 엔드포인트/인증 경로/스키마 변경 없음. 기존 위협 등록부(T-33-09, `onConflict: kapt_code` upsert)와 동일한 서비스 롤 키 기반 로컬/CI 실행 경로만 사용.

## User Setup Required

None — 기존 `KAPT_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY` 환경변수 재사용, 신규 외부 서비스 연동 없음.

## Issues Encountered

1. **`SUPABASE_SERVICE_ROLE_KEY` 빈 값 오버라이드 (33-00과 동일 환경 이슈)** — `@next/env`의 `.env.production.local`(배포용 플레이스홀더, `SUPABASE_SERVICE_ROLE_KEY=""`)이 `.env.local`보다 먼저 로드되어 실제 키를 덮어씀. 해결: 셸에서 `.env.local` 값을 미리 export한 뒤 스크립트 재실행 — 코드 변경 없음, 로컬 실행 시에만 필요한 셸 환경 우회(33-00-SUMMARY.md에 문서화된 것과 동일 패턴 재적용)

## Next Phase Readiness

- `complexes` 테이블이 경남 신규 16개 시군구의 Golden Record 기반(788건, 99.5% 상세정보 보강)을 갖추어, 33-07(국토부 실거래가 다회 분할 백필)에서 신규 지역 거래가 `match_complex_by_admin` RPC로 자동 매칭될 기반이 마련됨
- 잔여 4건(K-apt API 데이터 공백)은 `built_year IS NULL` 조건으로 인해 향후 `kapt-enrich.ts` 재실행 시 자동으로 재시도됨 — 별도 후속 조치 불필요
- `kapt.ts`의 `server-only` 제거로 관련 스크립트 6개 + CI 워크플로 2개가 모두 정상 실행 가능한 상태로 복구됨 — 향후 K-apt 관련 배치 작업의 잠재적 블로커 해소
- 블로커 없음

---
*Phase: 33-db-1*
*Completed: 2026-07-03*

## Self-Check: PASSED

- `.planning/phases/33-db-1/33-06-SUMMARY.md` — FOUND
- `src/services/kapt.ts` — FOUND
- Commit `7be9031` — FOUND in `git log`
- `complexes` 테이블 신규 지역(16개 sgg_code) 행 수: 788건 (DB 직접 조회로 검증, 본문 수치와 일치)
- `complexes` 테이블 신규 지역 si NOT NULL: 784/788 (99.5%, DB 직접 조회로 검증)
