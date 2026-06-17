---
phase: 25-naver-listing-crawl
plan: "03"
subsystem: complex-detail-ui
tags: [recharts, listing-prices, naver, chart, ssr-safe]
dependency_graph:
  requires:
    - 25-01  # naver_complex_no 마이그레이션
    - 25-02  # crawl-naver-listings 스크립트
  provides:
    - listing-history-data-layer
    - listing-price-chart-component
    - complex-detail-page-integration
  affects:
    - src/app/complexes/[id]/page.tsx
tech_stack:
  added: []
  patterns:
    - next/dynamic ssr:false (Recharts SSR 제외)
    - TDD RED/GREEN (listing-history.ts)
    - Promise.all 마지막 항목 추가 패턴
key_files:
  created:
    - src/lib/data/listing-history.ts
    - src/lib/data/listing-history.test.ts
    - src/components/complex/ListingPriceSection.tsx
    - src/components/complex/ListingPriceSectionWrapper.tsx
    - src/components/complex/ListingPriceSection.test.tsx
  modified:
    - src/app/complexes/[id]/page.tsx
decisions:
  - "Recharts Tooltip formatter는 ValueType(=string|number|Array|null|undefined)을 받으므로 typeof 가드 사용"
  - "txByYm Record<string, number[]> non-null assertion(!.)으로 TypeScript strict 통과"
  - "테스트 배열 인덱스 접근 result[0]?.xxx 옵셔널 체이닝으로 tsc noEmit 통과"
metrics:
  duration: "약 15분"
  completed_date: "2026-06-17"
  tasks_completed: 3
  files_count: 6
---

# Phase 25 Plan 03: UI 통합 (호가 히스토리 차트) Summary

호가 히스토리 데이터 레이어 + Recharts 차트 컴포넌트 + 단지 상세 페이지 통합을 TDD로 구현. `listing_prices.source='naver'` 12개월 데이터를 실거래 평당가와 병합하여 ComposedChart로 시각화.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | listing-history.ts 데이터 레이어 (TDD) | bdba199, 5002b0a | listing-history.ts, listing-history.test.ts |
| 2 | ListingPriceSection + Wrapper | 4441f18 | ListingPriceSection.tsx, ListingPriceSectionWrapper.tsx, ListingPriceSection.test.tsx |
| 3 | 단지 상세 페이지 통합 | 48a19ce | page.tsx (import 3개 + Promise.all + JSX) |

## What Was Built

**`src/lib/data/listing-history.ts`**
- `getListingPriceHistory(complexId, supabase, months=12)` 서버 전용 함수
- `.eq('source', 'naver')` + `.gte('recorded_date', cutoff)` + 오름차순 정렬
- `ListingPricePoint` 인터페이스 export

**`src/components/complex/ListingPriceSection.tsx`**
- `'use client'`, Recharts `ComposedChart`
- 호가 Line: `#ea580c` (주황 실선), 실거래 Line: `#1d4ed8` (파랑 점선 `strokeDasharray="4 2"`)
- `mergeData()`: 호가 YYYY-MM-DD→YYYY-MM 집계, 실거래 월평균 평당가 계산, 합집합 정렬
- area=0 division-by-zero 방어, py 범위 100~99999 필터

**`src/components/complex/ListingPriceSectionWrapper.tsx`**
- `'use client'`, `next/dynamic ssr:false` 래퍼 (Recharts SSR 비용 제거 — T-25-03-03)
- loading fallback: 220px 높이 스켈레톤

**`src/app/complexes/[id]/page.tsx`**
- import 3개 추가: `getListingPriceHistory`, `ListingPricePoint`, `ListingPriceSectionWrapper`
- `Promise.all` 마지막에 `getListingPriceHistory` 추가 → `listingHistory` 변수
- JSX: `listingHistory.length > 0` 조건부 렌더 (시세 흐름 카드 아래, 주변 단지 비교 위)
- `export const revalidate = 86400` 유지 확인

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Recharts Tooltip formatter TypeScript 타입 오류**
- **Found during:** Task 3 (npm run build)
- **Issue:** `(v: number) => [string]` 형태로 작성 시 Recharts `ValueType | undefined` 할당 불가 오류
- **Fix:** `(v) => { if (typeof v === 'number') ... }` 형태로 타입 가드 추가
- **Files modified:** src/components/complex/ListingPriceSection.tsx
- **Commit:** 48a19ce

**2. [Rule 1 - Bug] `txByYm[t.yearMonth].push()` TypeScript strict 오류**
- **Found during:** Task 3 (npm run build)
- **Issue:** `Record<string, number[]>` 인덱싱 결과가 `number[] | undefined`로 추론되어 `.push()` 호출 불가
- **Fix:** 직전에 `if (!txByYm[...]) = []` 초기화 후 non-null assertion `!.push()` 추가 (소스 + 테스트 파일 동일 패턴)
- **Files modified:** src/components/complex/ListingPriceSection.tsx, ListingPriceSection.test.tsx
- **Commit:** 48a19ce

**3. [Rule 1 - Bug] 테스트 파일 배열 인덱스 tsc noEmit 오류**
- **Found during:** Task 3 (npm run lint → tsc --noEmit)
- **Issue:** `result[0].yearMonth` 등 배열 인덱스 접근 시 `possibly 'undefined'` (noUncheckedIndexedAccess 가능성)
- **Fix:** `result[0]?.xxx` 옵셔널 체이닝으로 수정 (listing-history.test.ts, ListingPriceSection.test.tsx)
- **Files modified:** 두 테스트 파일
- **Commit:** 48a19ce

## Test Results

```
listing-history.test.ts: 5 passed
ListingPriceSection.test.tsx: 7 passed (mergeData 6 + module smoke 1)
listing-prices.test.ts: 8 passed (기존)
Total: 19 passed
```

## Build & Lint

- `npm run build`: 성공 (타입 에러 없음)
- `npm run lint`: ESLint 경고/오류 없음, tsc --noEmit 통과

## Known Stubs

없음. `listingHistory.length > 0` 조건부 렌더이므로 크롤링 데이터 없는 단지에서는 섹션 자체가 숨겨짐.

## Threat Flags

없음. 신규 네트워크 엔드포인트 없음. RSC에서 fetch → props로 전달하는 기존 패턴 재사용.

## TDD Gate Compliance

- RED gate: `test(25-03): add failing test for getListingPriceHistory` (bdba199)
- GREEN gate: `feat(25-03): implement getListingPriceHistory data layer` (5002b0a)
- REFACTOR gate: 불필요 (코드 정리 없음)

## Self-Check: PASSED

파일 존재 확인:
- src/lib/data/listing-history.ts: FOUND
- src/components/complex/ListingPriceSection.tsx: FOUND
- src/components/complex/ListingPriceSectionWrapper.tsx: FOUND

핵심 패턴 확인:
- listing-history.ts: .eq('source', 'naver'): FOUND
- ListingPriceSection.tsx: 'use client': FOUND
- ListingPriceSection.tsx: #ea580c, #1d4ed8: FOUND
- page.tsx: getListingPriceHistory import: FOUND
- page.tsx: listingHistory.length > 0: FOUND
- page.tsx: export const revalidate = 86400: FOUND (기존 유지)

커밋 존재 확인:
- bdba199 (test RED): FOUND
- 5002b0a (feat GREEN): FOUND
- 4441f18 (feat Task 2): FOUND
- 48a19ce (feat Task 3): FOUND
