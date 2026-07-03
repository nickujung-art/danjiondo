---
phase: 33-db-1
plan: "00"
subsystem: database
tags: [supabase, regions, seed, molit, data-layer]

# Dependency graph
requires: []
provides:
  - "regions 테이블에 경남 전체 22개 시군구(기존 6 + 신규 16) 시딩 완료"
  - "신규 16개 sgg_code의 국토부 LAWD_CD 유효성 API 단발 검증 완료"
  - "src/lib/data/regions.ts — getActiveSggCodes()/getActiveCityNames() 공용 동적 조회 헬퍼"
  - "seed-region.test.ts 경남 전체 확장 기준 갱신"
affects: [33-01, 33-02, 33-03, 33-04, 33-05, 33-06, 33-09, 33-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "regions 테이블 is_active=true 동적 조회 (server-only 함수 + SupabaseClient<Database> 파라미터 주입)"

key-files:
  created:
    - src/lib/data/regions.ts
    - src/lib/data/regions.test.ts
  modified:
    - scripts/seed.ts
    - src/__tests__/seed-region.test.ts

key-decisions:
  - "sgg_name/si/gu 값은 RESEARCH.md 스켈레톤 그대로 사용 — 코드 MEDIUM confidence였으나 Task 2 API 단발 검증으로 HIGH confidence 확정"
  - "getActiveCityNames는 정규식 (시|군)$ 접미사 제거 — 청약홈 HSSPLY_ADRES 문자열 매칭 대비"
  - "seed-region.test.ts: 기존 TARGET_SGG_CODES를 CHANGWON_GIMHAE_SGG_CODES로 이름변경(하위호환 유지), GYEONGNAM_EXPANSION_SGG_CODES 신규 추가, count >= 22로 검증(향후 재확장 대비 >= 사용)"

patterns-established:
  - "regions 동적 조회 공용 헬퍼: src/lib/data/regions.ts — Wave 1의 모든 하드코딩 필터 리팩터 plan(33-01~33-05, 33-09, 33-10)이 이 파일을 import"

requirements-completed: [REGION-01]

# Metrics
duration: 25min
completed: 2026-07-03
---

# Phase 33 Plan 00: regions 테이블 경남 전체 시딩 + 동적 조회 공용 헬퍼 Summary

**regions 테이블에 경남 16개 신규 시군구를 시딩하고 국토부 API로 유효성을 단발 검증했으며, Wave 1 전체가 의존할 `getActiveSggCodes()`/`getActiveCityNames()` 공용 동적 조회 헬퍼를 확정했다.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-03T14:11:00+09:00 (직전 커밋 928d518 직후)
- **Completed:** 2026-07-03T14:36:03+09:00
- **Tasks:** 3/3 완료
- **Files modified:** 4 (1 created 신규 2, 수정 2)

## Accomplishments
- `regions` 테이블 22행(기존 6 + 신규 16) 시딩 완료, 신규 16행 모두 `is_active=true`, `gu=null` 확인
- 신규 16개 sgg_code 전부 국토부 실거래가 API에서 `status='success'`로 응답 확인 — 진주(393건)·통영(85건)·사천(166건)·밀양(64건)·거제(235건)·양산(437건) 등 주요 시에서 실데이터 확보, 의령군(48720)만 해당 월 0건(농어촌 소규모 지역, 정상 상황)
- `src/lib/data/regions.ts` 신규 생성 — Wave 1의 8개 plan(33-01~33-06, 33-09, 33-10)이 공통으로 import할 인터페이스 계약 확정
- `seed-region.test.ts`를 경남 전체 22개 시군구 기준으로 갱신 (기존 6개 하드코딩 검증에서 확장)

## Task Commits

Each task was committed atomically:

1. **Task 1: 경남 16개 신규 시군구 regions 시딩** - `d6ee7fd` (feat)
2. **Task 2: 신규 시군구 법정동코드 단발 검증** - 코드 변경 없음(검증 전용), 결과는 본 SUMMARY 및 `ingest_runs` 테이블에 기록됨
3. **Task 3: 지역 마스터 동적 조회 공용 헬퍼 + 테스트 정합성** - `e7ca64a` (feat)

_Task 2는 plan 명세대로 "파일 없음(검증 전용)" 태스크로, 커밋 대상 코드 변경이 없음._

## Files Created/Modified
- `scripts/seed.ts` - REGIONS 배열에 경남 16개 신규 시군구(진주·통영·사천·밀양·거제·양산시 + 의령·함안·창녕·고성·남해·하동·산청·함양·거창·합천군) 추가
- `src/lib/data/regions.ts` - `getActiveSggCodes()`/`getActiveCityNames()` server-only 공용 동적 조회 함수 (신규)
- `src/lib/data/regions.test.ts` - mock supabase 기반 유닛 테스트 4건 (신규)
- `src/__tests__/seed-region.test.ts` - `TARGET_SGG_CODES`→`CHANGWON_GIMHAE_SGG_CODES` 이름변경 + `GYEONGNAM_EXPANSION_SGG_CODES`(16개) 추가 + "경남 전체 22개 시군구 존재"/"경남 확장 16개 시군구 gu=null" 테스트 2건 추가

## Decisions Made
- `getActiveSggCodes`/`getActiveCityNames`는 `scripts/backfill-realprice.ts`의 기존 검증된 패턴(`getSggCodes()`)을 RSC 데이터 레이어용으로 그대로 이식 — 신규 캐싱 레이어(React `cache()` 등)는 이번 plan 범위 밖, Wave 1 개별 plan에서 필요 시 도입
- `seed-region.test.ts`의 "경남 전체 22개" 검증은 `count >= 22`(정확히 `=22`가 아님)로 작성 — upsert 기반 시딩 특성상 향후 재확장(2단계 인접 광역시 등) 시 테스트가 깨지지 않도록 방어

## Deviations from Plan

None - plan executed exactly as written. (환경 이슈 대응은 아래 "Issues Encountered" 참고 — 코드/로직 변경이 아닌 로컬 실행 환경 우회였으므로 Deviation Rule 대상 아님)

## Issues Encountered

1. **`npm run db:seed` 최초 실행 시 `supabaseKey is required` 에러** — 원인: `scripts/seed.ts`가 `@next/env`의 `loadEnvConfig()`를 사용하는데, Next.js 환경변수 우선순위상 `.env.production.local`(값이 `SUPABASE_SERVICE_ROLE_KEY=""`로 비어있는 배포용 플레이스홀더 파일)이 `.env.local`보다 먼저 로드되어 실제 키를 덮어씀. 해결: 셸에서 `SUPABASE_SERVICE_ROLE_KEY`를 미리 export(이미 존재하는 process.env 값은 dotenv/`@next/env`가 덮어쓰지 않음)한 뒤 `npm run db:seed` 재실행 — 코드 변경 없음, 로컬 실행 시에만 필요한 셸 환경 우회. `.env.production.local`은 배포 환경 전용 파일이라 이번 plan 범위에서 수정하지 않음(Scope Boundary).
2. **`npx vitest run src/__tests__/seed-region.test.ts`의 `describe.skipIf(!SKEY)` integration 블록이 로컬 Docker Supabase(127.0.0.1:54321) 연결 실패로 6건 timeout** — 원인: 이 환경에 Docker Desktop이 실행되어 있지 않아 로컬 Supabase 스택(`supabase start`)을 띄울 수 없음(pre-existing 인프라 제약, 이번 plan과 무관). 검증: `TEST_SUPABASE_URL`/`TEST_SUPABASE_SKEY`를 프로덕션 Supabase 자격증명으로 임시 오버라이드하여 동일 테스트 파일을 재실행한 결과 10/10 전체 통과 확인 — 테스트 로직 자체는 정상이며, 실패 원인은 순수 로컬 인프라(Docker 미실행) 문제. 코드 수정 없음.

## Known Environment Gap

- 로컬 개발 환경에 Docker Desktop이 실행되어 있지 않아 `describe.skipIf(!SKEY)` integration 테스트가 CI/로컬 Supabase 스택 없이는 timeout으로 실패한다. GitHub Actions CI 또는 `supabase start` 가능한 환경에서는 정상 통과 확인됨(프로덕션 자격증명으로 대체 검증 완료). 코드 결함 아님 — 후속 조치 불필요.

## Deferred Items (Out of Scope)

`.planning/phases/33-db-1/deferred-items.md`에 기록:
- `npm run lint` 실행 중 발견된 5건의 pre-existing 미사용 `Link` import 에러(`src/app/ads/page.tsx`, `src/app/compare/page.tsx`, `src/app/legal/{ad-policy,privacy,terms}/page.tsx`) — 이번 plan이 건드리지 않은 파일이며 Scope Boundary 규칙에 따라 수정하지 않음. 별도 소형 정리 작업 권장.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `regions` 테이블이 경남 전체 22개 시군구로 확정되어, Wave 1의 모든 하드코딩 필터 리팩터 plan(33-01~33-06, 33-09, 33-10)이 즉시 병렬 착수 가능
- `src/lib/data/regions.ts`의 `getActiveSggCodes()`/`getActiveCityNames()` 인터페이스 계약이 확정되어 Wave 1 plan들이 바로 import 가능
- 신규 16개 sgg_code가 국토부 API에서 유효함이 검증되어, 33-07(10년 다회 분할 백필) 실행 시 무의미한 API 호출 낭비 리스크(Pitfall 4) 해소됨
- 블로커 없음

---
*Phase: 33-db-1*
*Completed: 2026-07-03*

## Self-Check: PASSED

All created/modified files verified present on disk; both task commit hashes (`d6ee7fd`, `e7ca64a`) verified in `git log`.
