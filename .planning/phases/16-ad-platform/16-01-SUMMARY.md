---
phase: 16-ad-platform
plan: "01"
subsystem: ads
tags: [ads, carousel, homepage, banner, tdd]
dependency_graph:
  requires: []
  provides: [AdBannerCarousel, banner_top-homepage-integration]
  affects: [src/app/page.tsx, src/components/ads/AdBannerCarousel.tsx]
tech_stack:
  added: []
  patterns: [useState+setInterval rotation, RSC prop passing to client component]
key_files:
  created:
    - src/components/ads/AdBannerCarousel.tsx
    - src/__tests__/ad-banner-carousel.test.tsx
  modified:
    - src/app/page.tsx
    - src/components/map/PresalePin.tsx
decisions:
  - "ads=[] → return null 패턴으로 홈페이지 정상 렌더링 보장"
  - "setInterval cleanup을 useEffect return으로 처리하여 메모리 누수 방지"
metrics:
  duration: "~10min"
  completed: "2026-05-26"
  tasks_completed: 3
  files_changed: 4
---

# Phase 16 Plan 01: 홈페이지 배너 광고 캐러셀 연결 Summary

AdBannerCarousel 클라이언트 컴포넌트를 생성하고 홈페이지 RSC에서 banner_top 광고를 fetch하여 h1 위에 삽입 — 4초 자동 로테이션, 광고 없을 때 null 반환.

## Files Changed

### Created
- `src/components/ads/AdBannerCarousel.tsx` — 복수 광고 4초 자동 로테이션 클라이언트 컴포넌트
- `src/__tests__/ad-banner-carousel.test.tsx` — 4개 단위 테스트 (TDD RED→GREEN)

### Modified
- `src/app/page.tsx` — getActiveAds('banner_top') Promise.all 추가, AdBannerCarousel 삽입 (revalidate=60 유지)
- `src/components/map/PresalePin.tsx` — 사전 존재 ESLint 에러 수정 (id→_id, Rule 1 auto-fix)

## Test Results

```
✓ ads=[] → 아무것도 렌더링하지 않는다
✓ ads=[단일광고] → 인덱스 0 광고를 렌더링한다
✓ ads=[광고1, 광고2] → 초기에 인덱스 0이 표시된다
✓ ads=[광고1, 광고2] → 4초 후 인덱스 1로 전환된다

Test Files: 1 passed (1)
Tests:      4 passed (4)
```

## Build Result

`npm run build` — 성공. 타입 에러 없음 (기존 `ad-inquiry-action.test.ts`의 16-02 RED 테스트 타입 에러 제외 — 사전 존재).

## TDD Gate Compliance

- RED gate: `b9d653b` — `test(16-01): AdBannerCarousel RED — 4개 테스트 케이스 (failing)`
- GREEN gate: `55ad6e4` — `feat(16-01): AdBannerCarousel 구현 + 홈페이지 banner_top 연결 (GREEN)`

## Commits

| Hash | Message |
|------|---------|
| b9d653b | test(16-01): AdBannerCarousel RED — 4개 테스트 케이스 (failing) |
| 55ad6e4 | feat(16-01): AdBannerCarousel 구현 + 홈페이지 banner_top 연결 (GREEN) |
| 95d6fcb | fix(map): PresalePin unused id parameter — _id prefix (lint fix) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] .ts → .tsx 확장자 수정**
- **Found during:** Task 1
- **Issue:** 테스트 파일에 JSX 문법이 있으나 `.ts` 확장자로 생성되어 esbuild 파싱 에러 발생
- **Fix:** `ad-banner-carousel.test.ts` → `ad-banner-carousel.test.tsx` 로 이름 변경
- **Files modified:** src/__tests__/ad-banner-carousel.test.tsx

**2. [Rule 1 - Bug] PresalePin.tsx unused id 변수 ESLint 에러**
- **Found during:** Task 3 (build verification)
- **Issue:** 사전 존재하는 ESLint `no-unused-vars` 에러가 빌드를 막음
- **Fix:** `id` → `_id` prefix로 변경
- **Files modified:** src/components/map/PresalePin.tsx
- **Commit:** 95d6fcb

## Verification Checklist

- [x] `src/components/ads/AdBannerCarousel.tsx` 존재
- [x] `'use client'` 선언 확인
- [x] `src/app/page.tsx`에 AdBannerCarousel import + 사용
- [x] `src/app/page.tsx`에 getActiveAds 호출
- [x] `export const revalidate = 60` 유지
- [x] `return null` (ads.length === 0 케이스)
- [x] `npm run test -- ad-banner-carousel` 4개 GREEN
- [x] `npm run build` 성공

## Self-Check: PASSED

- src/components/ads/AdBannerCarousel.tsx: FOUND
- src/__tests__/ad-banner-carousel.test.tsx: FOUND
- Commits b9d653b, 55ad6e4, 95d6fcb: FOUND in git log
