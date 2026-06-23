---
phase: 29-mobile-optimization
plan: "03"
subsystem: complex-detail-mobile
tags: [mobile, complex-detail, embla-carousel, bottom-sheet, vaul, swipe-tabs, isr]
dependency_graph:
  requires:
    - Plan 01 (BottomSheet 컴포넌트, vaul 설치)
    - Plan 02 (AppHeader, BottomTabBar 전역 통합)
  provides:
    - 단지상세 page.tsx mobile-first 레이아웃 (ISR 유지)
    - DealTypeTabs Embla 스와이프 캐러셀
    - HagwonRecommendSheet → 공유 BottomSheet 전환
    - EducationCard → SchoolDetailSheet + SchoolRankingSheet BottomSheet 전환 (D-11)
    - RedevelopmentSheet 클라이언트 컴포넌트 (D-11)
  affects:
    - src/app/complexes/[id]/page.tsx (단지상세 모든 단지)
    - 단지 교육 환경 팝업 (SchoolDetailSheet, SchoolRankingSheet)
    - 학원 추천 시트 (HagwonRecommendSheet)
    - 재건축 타임라인 (RedevelopmentSheet)
tech_stack:
  added: []
  patterns:
    - Embla Carousel startIndex sync (URL 직접 진입 대응)
    - emblaApi.on('select', cb) → nuqs/useState 동기화
    - RSC → Client boundary (RedevelopmentSheet wraps RedevelopmentTimeline)
    - vaul BottomSheet 일관 적용 (D-11)
key_files:
  created:
    - src/components/complex/RedevelopmentSheet.tsx
  modified:
    - src/app/complexes/[id]/page.tsx
    - src/components/complex/DealTypeTabs.tsx
    - src/components/complex/HagwonRecommendSheet.tsx
    - src/components/complex/EducationCard.tsx
decisions:
  - "Embla 두 슬라이드를 항상 렌더링 — 매매/전세 각각 별도 areaGroups + chart 계산 (성능보다 UX 일관성 우선)"
  - "기간 필터(period)는 Embla 외부 유지 — 두 탭 공통 필터이므로 슬라이드 밖에서 제어"
  - "RedevelopmentSheet props = {phase, notes} — RedevelopmentTimeline과 동일한 API 유지"
  - "JSX 따옴표 이스케이프(&ldquo;) — 사전 존재 lint 오류 Rule 1 수정"
metrics:
  duration: "~25분"
  completed_date: "2026-06-23"
  tasks_completed: 5
  files_created: 1
  files_modified: 4
---

# Phase 29 Plan 03: 단지상세 mobile-first 재작성 Summary

**One-liner:** 단지상세 page.tsx 인라인 헤더 제거 + main 그리드 Tailwind 전환, DealTypeTabs에 Embla 스와이프 추가, HagwonRecommendSheet·EducationCard의 3개 시트를 공유 BottomSheet로 전환, RedevelopmentSheet 클라이언트 래퍼 신규 생성.

## What Was Built

### Task 1: page.tsx mobile-first 재작성

**`src/app/complexes/[id]/page.tsx`**
- 인라인 `<header>` 블록 전체 삭제 (로고, 브레드크럼, ShareButton, FavoriteButton, CompareAddButton, 알림링크)
- ShareButton, FavoriteButton, CompareAddButton, 알림 Link → hero 카드 내 `<div className="flex flex-wrap gap-2 mt-3">` 로 이동
- `<main>` style → `className="px-4 py-4 sm:px-6 sm:py-6 max-w-screen-xl mx-auto grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:gap-6"`
- 메인 컬럼 + 우측 레일 `display: flex` inline style → `className="flex flex-col gap-4"`
- `export const revalidate = 86400` 유지, `'use client'` 없음, `max-sm:` 패턴 없음

### Task 2a: DealTypeTabs Embla 스와이프

**`src/components/complex/DealTypeTabs.tsx`**
- `useEmblaCarousel` import + `startIndex: activeTabIndex` 설정
- `emblaApi.on('select', onSelect)` → setActive 동기화 (nuqs Pitfall 6 대응)
- 탭 클릭 → `emblaApi.scrollTo(idx)` 호출
- 탭 버튼 행: `sticky top-14 z-30 bg-white border-b` + 각 버튼 `min-h-[44px]` (D-10)
- 기간 필터: Embla 외부, 두 탭 공통 (shared URL param)
- Embla 두 슬라이드: 매매·전세 각각 독립 areaGroups + TransactionChart

### Task 2b: HagwonRecommendSheet BottomSheet 전환

**`src/components/complex/HagwonRecommendSheet.tsx`**
- `createPortal` 제거, `BottomSheet` import 추가
- 딤 배경 + 시트 div + 드래그 핸들 + 헤더 + 닫기 버튼 → vaul BottomSheet가 제공
- Step 인디케이터(1/3, 2/3, 3/3)와 설명문은 children 상단에 유지
- 내부 step 로직 (age/school/prefs/loading/result) 100% 보존

### Task 3: EducationCard BottomSheet 전환 (D-11)

**`src/components/complex/EducationCard.tsx`**
- `createPortal` 제거, `BottomSheet` import 추가
- **SchoolDetailSheet**: `<BottomSheet open={true} onClose={onClose} title={school.school_name}>` — 학교 아이콘 + 배지는 children 상단 유지, 기본정보·환경지표·진학률·학군부동산 100% 보존
- **SchoolRankingSheet**: `<BottomSheet open={true} onClose={onClose} title={`${si} ${type} 순위`}>` — 구 필터·순위 목록 100% 보존

### Task 4: RedevelopmentSheet 신규 생성 (D-11)

**`src/components/complex/RedevelopmentSheet.tsx`** (신규)
- `'use client'` + `useState(false)` — RSC page.tsx에서 Client 경계 분리
- 트리거 버튼: `min-h-[44px]` + "재건축 진행 현황 · 자세히 보기 ›"
- `<BottomSheet title="재건축 진행 단계">` 내부에 `<RedevelopmentTimeline>` 래핑

**`src/app/complexes/[id]/page.tsx`** — RedevelopmentTimeline → RedevelopmentSheet 교체

## Commits

| Hash | Message |
|------|---------|
| 5e5b727 | feat(29-03): mobile-first 단지상세 page.tsx — 인라인 헤더 제거, main 그리드 Tailwind 전환 |
| c645405 | feat(29-03): DealTypeTabs — Embla 스와이프 캐러셀 추가, 44px 탭 터치 타겟, sticky top-14 탭바 |
| 60cd8c8 | feat(29-03): HagwonRecommendSheet — createPortal 제거, 공유 BottomSheet로 전환 |
| c151f3f | feat(29-03): EducationCard — SchoolDetailSheet + SchoolRankingSheet 공유 BottomSheet로 전환 |
| 287cc05 | feat(29-03): RedevelopmentSheet 신규 생성 — BottomSheet 트리거 버튼, page.tsx 통합 |
| 722f06d | fix(29-03): HagwonRecommendSheet — JSX 따옴표 이스케이프 (react/no-unescaped-entities) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] HagwonRecommendSheet JSX 따옴표 이스케이프**
- **Found during:** npm run lint 최종 검증
- **Issue:** `HagwonCard` 내 `"{reviewQuote}"` — JSX에서 리터럴 `"` 사용 (react/no-unescaped-entities)
- **Fix:** `&ldquo;{reviewQuote}&rdquo;` 로 교체
- **Files modified:** `src/components/complex/HagwonRecommendSheet.tsx`
- **Commit:** 722f06d

## Known Stubs

없음 — 모든 콘텐츠는 실제 데이터로 구동됨.

## Threat Flags

없음 — 신규 API 엔드포인트/auth 경로/외부 네트워크 호출 없음.
- `export const revalidate = 86400` 유지 (T-29-06 mitigated)
- Embla startIndex를 activeTabIndex에서 도출 (T-29-07 mitigated)
- vaul 내장 포커스 트랩 (T-29-08 accepted)

## Self-Check: PASSED

- [x] `src/app/complexes/[id]/page.tsx` — `export const revalidate = 86400` 유지
- [x] `src/app/complexes/[id]/page.tsx` — `'use client'` 없음
- [x] `src/app/complexes/[id]/page.tsx` — 인라인 `<header>` 없음
- [x] `src/app/complexes/[id]/page.tsx` — `lg:grid-cols-[1fr_360px]` 포함
- [x] `src/app/complexes/[id]/page.tsx` — `max-sm:` 패턴 없음
- [x] `src/components/complex/DealTypeTabs.tsx` — `useEmblaCarousel` import + 사용
- [x] `src/components/complex/DealTypeTabs.tsx` — `overflow-hidden` + `flex` + `min-w-full` Embla 래퍼
- [x] `src/components/complex/DealTypeTabs.tsx` — 탭 버튼 `min-h-[44px]`
- [x] `src/components/complex/HagwonRecommendSheet.tsx` — `BottomSheet` import + 사용
- [x] `src/components/complex/HagwonRecommendSheet.tsx` — `createPortal` 없음
- [x] `src/components/complex/EducationCard.tsx` — `BottomSheet` 2회 이상 사용
- [x] `src/components/complex/EducationCard.tsx` — `createPortal` 없음
- [x] `src/components/complex/RedevelopmentSheet.tsx` 생성됨
- [x] `src/components/complex/RedevelopmentSheet.tsx` — `BottomSheet` 사용
- [x] `src/components/complex/RedevelopmentSheet.tsx` — 트리거 버튼 `min-h-[44px]`
- [x] `npx tsc --noEmit` — 에러 없음
- [x] `npm run lint` — 에러 없음
- [x] 커밋 5e5b727, c645405, 60cd8c8, c151f3f, 287cc05, 722f06d 모두 존재
