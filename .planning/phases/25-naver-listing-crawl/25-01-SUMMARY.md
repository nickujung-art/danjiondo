---
phase: 25-naver-listing-crawl
plan: "01"
subsystem: api
tags: [naver, crawling, adapter, zod, haversine, batch-script]

# Dependency graph
requires:
  - phase: 25-00
    provides: complexes.naver_complex_no 컬럼 마이그레이션
provides:
  - src/services/naver-land.ts — searchNaverComplex, fetchNaverListings, parsePrcInfo, normalizeComplexName, haversineDistanceM
  - scripts/map-naver-complexes.ts — naver_complex_no 일괄 매핑 스크립트
affects:
  - 25-02 (crawl-naver-listings.ts — naver-land.ts 어댑터 사용)
  - 25-03 (ListingPriceSection — DB에 매핑된 complexNo 필요)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "naver-land.ts: server-only 미포함으로 scripts/ 배치에서도 import 가능 (naver-cafe.ts와 다른 패턴)"
    - "Zod safeParse()로 비공개 API 응답 화이트리스트 필드 추출 (T-25-01-02 mitigate)"
    - "이름 정규화 + haversine 거리 < 200m 복합 매칭 (CLAUDE.md 단지명 단독 매칭 금지 준수)"

key-files:
  created:
    - src/services/naver-land.ts
    - src/services/naver-land.test.ts
    - scripts/map-naver-complexes.ts
  modified: []

key-decisions:
  - "server-only 미포함 결정: scripts/ 배치 스크립트에서도 import 가능하도록 naver-cafe.ts와 달리 server-only 추가 안 함"
  - "모바일 API(m.land.naver.com) 우선, PC API fallback: 모바일 API가 문서화 사례 다수이며 더 안정적"
  - "haversine 200m 임계값: 단지 경계 오차 허용, 조작 방지 (T-25-01-01 mitigate)"
  - "동시 요청 2개 + 1.5초 sleep: 네이버 rate limit 방지 (T-25-01-04 mitigate)"

patterns-established:
  - "parsePrcInfo 패턴: 5억 3,000 → 53000 (쉼표 제거 → 억/만원 regex 분리)"
  - "normalizeComplexName: 아파트 접미사 + 시명 제거 + 공백 압축 + 소문자화"
  - "TDD RED→GREEN: 테스트 먼저 커밋 후 구현 커밋"

requirements-completed: [LISTING-02]

# Metrics
duration: 25min
completed: 2026-06-17
---

# Phase 25 Plan 01: 네이버 부동산 어댑터 + 매핑 스크립트 Summary

**네이버 부동산 비공개 API 어댑터(naver-land.ts)와 complexes.naver_complex_no 일괄 매핑 스크립트(map-naver-complexes.ts) — parsePrcInfo·haversine 복합 매칭 포함**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-17T10:43:00Z
- **Completed:** 2026-06-17T10:50:00Z
- **Tasks:** 2 (Task 1: TDD 3커밋, Task 2: 1커밋)
- **Files modified:** 3

## Accomplishments

- `parsePrcInfo("5억 3,000") === 53000` 포함 10개 단위 테스트 전체 통과
- 네이버 모바일 API 우선 + PC API fallback 매물 조회 함수 구현 (Zod safeParse 응답 검증)
- 단지명 단독 매칭 금지 준수: 이름 정규화 + haversine 거리 < 200m 복합 매칭 알고리즘 구현
- --dry-run 모드로 DB 변경 없이 매핑 시뮬레이션 가능 (1000개 단지 대상 확인)

## Task Commits

TDD 흐름으로 커밋 3개:

1. **Task 1 RED: 실패 테스트 먼저 커밋** - `70d8176` (test)
2. **Task 1 GREEN: 구현 파일 커밋** - `017809d` (feat)
3. **Task 2: map-naver-complexes.ts** - `73c359d` (feat)

_TDD 계획에 따라 test → feat 순서로 커밋_

## Files Created/Modified

- `src/services/naver-land.ts` — 네이버 부동산 API 어댑터 (parsePrcInfo, normalizeComplexName, haversineDistanceM, searchNaverComplex, fetchNaverListings)
- `src/services/naver-land.test.ts` — 단위 테스트 10개 (parsePrcInfo 5, normalizeComplexName 3, haversineDistanceM 2)
- `scripts/map-naver-complexes.ts` — naver_complex_no 일괄 매핑 배치 스크립트

## Decisions Made

- `server-only` 미포함: naver-cafe.ts는 `import 'server-only'`를 포함하지만, naver-land.ts는 scripts/ 배치 스크립트에서도 import 가능해야 하므로 제외
- 모바일 API 우선: `m.land.naver.com/complex/getComplexArticleList` — 크롤링 문서에서 검증된 안정적 엔드포인트
- 200m 임계값: 단지 경계 오차를 허용하면서도 naver_complex_no 조작 위험(T-25-01-01) 방지

## Deviations from Plan

**1. [Rule 1 - Bug] total=0 시 NaN% 방지**
- **Found during:** Task 2 (스크립트 구현)
- **Issue:** `stats.exact / total * 100`에서 total=0이면 NaN 출력
- **Fix:** `if (total > 0)` 분기 추가
- **Files modified:** scripts/map-naver-complexes.ts
- **Verification:** 로직 검토로 확인
- **Committed in:** 73c359d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** 계획 범위 내 소규모 수정. Scope creep 없음.

## Issues Encountered

- `npm run lint` (next lint): scripts/ 폴더는 next lint 스캔 범위 외 → `console.log`는 기존 scripts/ 파일(map-school-codes.ts 등)과 동일한 패턴으로 허용됨

## Threat Surface Scan

T-25-01-01 (Tampering: naver_complex_no 매핑): 좌표 200m 조건 엄수로 mitigate 적용됨
T-25-01-02 (Tampering: API 응답 파싱): Zod.safeParse()로 화이트리스트 필드만 추출
T-25-01-04 (DoS: rate limit): 1.5초 sleep + 동시 2개 제한

## Next Phase Readiness

- 25-02 (`scripts/crawl-naver-listings.ts`)에서 `searchNaverComplex`, `fetchNaverListings`를 import하여 호가 수집 가능
- `map-naver-complexes.ts --dry-run`으로 매핑 검토 후 실제 실행 필요 (1000개 단지 대상)
- 25-03 (ListingPriceSection UI)은 25-02 실행 후 listing_prices 데이터 적재 필요

## Self-Check: PASSED

- `src/services/naver-land.ts` — FOUND
- `src/services/naver-land.test.ts` — FOUND
- `scripts/map-naver-complexes.ts` — FOUND
- 커밋 70d8176, 017809d, 73c359d — FOUND (git log 확인)
- npm run test -- naver-land: 10/10 PASSED

---
*Phase: 25-naver-listing-crawl*
*Completed: 2026-06-17*
