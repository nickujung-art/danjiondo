---
phase: 33-db-1
plan: "09"
subsystem: api
tags: [nextjs, supabase, regions, map, ads]

# Dependency graph
requires:
  - phase: 33-00
    provides: "src/lib/data/regions.ts — getActiveSggCodes(supabase) 공용 동적 조회 헬퍼"
provides:
  - "/map 페이지가 regions 테이블(is_active=true) 기반 동적 조회로 지도 단지·검색 데이터 소스를 결정"
  - "/api/ads/sidebar가 regions 테이블 기반 동적 조회로 sgg_code 쿼리 파라미터 allowlist를 검증"
affects: [33-10, 33-07, 33-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getActiveSggCodes(supabase) 기반 서버 컴포넌트/API Route 내 지역 필터 동적 조회 — try/catch 없이 자연 전파(33-01/33-02 패턴과 동일)"

key-files:
  created: []
  modified:
    - src/app/map/page.tsx
    - src/app/api/ads/sidebar/route.ts

key-decisions:
  - "map/page.tsx: getComplexesForMap 실패는 기존 .catch(()=>[]) 유지, getActiveSggCodes 자체 실패는 try/catch 없이 자연 전파 — Wave 1 다른 plan과 일관성 유지"
  - "ads/sidebar/route.ts: raw 파싱 → supabase 생성 → activeSggCodes 조회 → sggCode 계산 순서로 재배치, .has() 검증 시맨틱·응답 스키마({ ads }, no-store)는 완전히 동일하게 유지"

patterns-established: []

requirements-completed: [REGION-09]

# Metrics
duration: 6min
completed: 2026-07-03
---

# Phase 33 Plan 09: /map·/api/ads/sidebar 하드코딩 지역 필터 동적 전환 Summary

**사이트 플래그십 기능인 지도 검색(/map)과 사이드바 광고 지역 타겟팅(/api/ads/sidebar)의 TARGET_SGG/VALID_SGG_CODES 하드코딩 배열을 getActiveSggCodes(regions 테이블) 기반 동적 조회로 교체, 경남 신규 16개 시군구가 지도·광고에 반영되도록 함.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-03T16:18:00+09:00 (직전 커밋 b0c066e 직후)
- **Completed:** 2026-07-03T16:19:08+09:00
- **Tasks:** 2/2 완료
- **Files modified:** 2

## Accomplishments
- `src/app/map/page.tsx`의 `TARGET_SGG` 7개 코드 하드코딩 배열 완전 삭제, `getActiveSggCodes(supabase)` 동적 조회로 대체 — 지도 단지 조회(`getComplexesForMap`)·검색(`searchComplexes`) 양쪽 모두 신규 16개 시군구 반영
- `src/app/api/ads/sidebar/route.ts`의 `VALID_SGG_CODES` 정적 Set 완전 삭제, 동적 `Set(await getActiveSggCodes(supabase))`로 대체 — `sgg_code` 쿼리 파라미터 allowlist 검증(T-33-12) 유지
- 두 파일 모두 UI 구조·헤딩 문구(`단지온도 지도 — 창원·김해 아파트 실거래가`)·응답 스키마(`{ ads }`, `Cache-Control: no-store`) 완전히 불변 — CONTEXT.md "UI 변경 없음" 원칙 준수
- `npx tsc --noEmit`, `npm run lint` 모두 대상 파일에 에러 없음 확인

## Task Commits

Each task was committed atomically:

1. **Task 1: /map 페이지 TARGET_SGG 동적 지역 필터 전환** - `b3f4af4` (feat)
2. **Task 2: 사이드바 광고 API VALID_SGG_CODES 동적 지역 필터 전환** - `4df0b0d` (feat)

## Files Created/Modified
- `src/app/map/page.tsx` - `TARGET_SGG` 삭제, `getActiveSggCodes(supabase)` import 및 `activeSggCodes` 사용으로 지도 단지·검색 조회 동적 전환
- `src/app/api/ads/sidebar/route.ts` - `VALID_SGG_CODES` 삭제, `getActiveSggCodes(supabase)` 기반 동적 Set으로 `sgg_code` allowlist 검증 전환

## Decisions Made
- map/page.tsx: `getActiveSggCodes` 호출 자체는 try/catch로 감싸지 않고 자연 전파 — Wave 1의 다른 plan(33-01 invest/page.tsx, 33-02 rankings.ts)과 동일한 무-try/catch 패턴 유지, `getComplexesForMap`/`searchComplexes` 개별 `.catch()`는 기존 그대로 보존
- ads/sidebar/route.ts: 기존 `raw` 파싱 → `sggCode` 계산 → `supabase` 생성 순서를 `raw` 파싱 → `supabase` 생성 → `activeSggCodes` 조회 → `sggCode` 계산으로 재배치 (plan 명세 그대로) — `.has()` 검증 시맨틱은 완전히 동일

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/map`, `/api/ads/sidebar` 모두 regions 테이블 기반 동적 지역 필터로 전환 완료 — 33-07(백필) 이후 경남 신규 16개 시군구 단지가 지도·사이드바 광고에 즉시 반영됨
- Wave 1의 나머지 plan(33-10 등)과 독립적으로 완료됨, 블로커 없음

---
*Phase: 33-db-1*
*Completed: 2026-07-03*

## Self-Check: PASSED

All modified files (`src/app/map/page.tsx`, `src/app/api/ads/sidebar/route.ts`) verified present on disk;
both task commit hashes (`b3f4af4`, `4df0b0d`) verified in `git log`.
