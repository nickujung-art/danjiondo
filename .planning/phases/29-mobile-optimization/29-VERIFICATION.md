---
phase: 29-mobile-optimization
verified: 2026-06-23T00:00:00Z
status: human_needed
score: 29/32 must-haves verified
overrides_applied: 0
human_verification:
  - test: "DealTypeTabs 매매→전세 스와이프 동작 확인"
    expected: "모바일/데스크탑 브라우저에서 단지상세 탭 영역을 좌우로 드래그 시 매매↔전세 슬라이드 전환"
    why_human: "Embla Carousel 코드는 올바르게 연결되어 있으나 실제 swipe gesture는 jsdom에서 검증 불가"
  - test: "375px 뷰포트에서 5개 페이지 가로 스크롤 없음 확인"
    expected: "홈/랭킹/단지상세/분양/투자 페이지를 375px Chrome DevTools에서 열면 수평 스크롤바 없음"
    why_human: "CSS 레이아웃 overflow 검증은 실제 브라우저 렌더링 필요"
  - test: "npm run lint && npm run build && npm run test 통과 확인"
    expected: "ESLint 오류 0건, Next.js 빌드 성공, Vitest 3종 GREEN"
    why_human: "빌드/테스트 실행 환경이 검증 세션에 없음. SUMMARY에는 통과로 기록되어 있으나 독립 실행 미확인"
gaps: []
---

# Phase 29: 모바일 최적화 Verification Report

**Phase Goal:** 전 페이지 mobile-first Tailwind 전환 — 하단탭바(홈/랭킹/분양/MY), 공유 BottomSheet 인프라, 44px 터치 타겟 준수
**Verified:** 2026-06-23
**Status:** human_needed
**Re-verification:** No — 초기 검증

---

## Goal Achievement

### Observable Truths

#### ROADMAP Success Criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | AppHeader(로고+알림) + BottomTabBar(4탭)가 모든 페이지에 표시된다 | ✓ VERIFIED | layout.tsx 5행: `import AppHeader`, 6행: `import BottomTabBar`. body에 `<AppHeader />` (58행), `<BottomTabBar />` (65행). 전역 레이아웃 통합 확인. |
| SC2 | 모든 버튼·링크·칩의 터치 영역이 44px 이상이다 | ⚠️ PARTIAL | 1차 네비게이션·필터 칩 44px 적용. DealTypeTabs 기간 필터 버튼(153행 `minHeight:32`)·평형 칩(188·223행 `minHeight:32`) 32px 유지 — ROADMAP SC의 "모든" 기준 미충족. |
| SC3 | 단지상세 탭을 좌우 스와이프로 전환할 수 있다 | ? UNCERTAIN | DealTypeTabs.tsx: `useEmblaCarousel` 5행, `emblaRef` 163행, `overflow-hidden flex`, `min-w-full` 슬라이드 2개 확인. 코드 레벨 검증 완료. 실제 swipe 동작은 브라우저 확인 필요. |
| SC4 | 모바일(375px)에서 홈·랭킹·단지상세·분양·투자 페이지가 가로 스크롤 없이 정상 표시된다 | ? UNCERTAIN | max-sm: 패턴 0건, px-4 padding, overflow-x-auto는 칩 행에만 스코핑. 실제 375px 렌더링은 브라우저 확인 필요. |
| SC5 | `npm run lint && npm run build && npm run test` 통과 | ? UNCERTAIN | 29-04-SUMMARY: "npm run lint — No ESLint warnings or errors", "npm run build — 빌드 성공". 검증 세션에서 독립 실행 미확인. 최신 커밋 a81270c (code review fixes) 이후 상태 미검증. |

**Score:** SC 기준 1/5 확정 VERIFIED, 1/5 PARTIAL, 3/5 UNCERTAIN

---

#### Plan Must-Haves (Plan 01~04 합산)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| P01-1 | AppHeader 56px sticky 헤더 항상 표시 | ✓ VERIFIED | AppHeader.tsx: `sticky top-0 z-50 h-14` (8행) |
| P01-2 | BottomTabBar 4탭 항상 고정 표시 | ✓ VERIFIED | BottomTabBar.tsx: `fixed bottom-0 left-0 right-0 z-40` (20행), TABS 배열 4항목 |
| P01-3 | 현재 경로 탭 --dj-orange 강조 | ✓ VERIFIED | BottomTabBar.tsx: `active ? 'var(--dj-orange)' : 'var(--fg-sec)'` (35행) |
| P01-4 | html2canvas 캡처에서 제외 | ✓ VERIFIED | AppHeader.tsx 9행·BottomTabBar.tsx 25행: `data-capture-hide="true"` |
| P01-5 | iOS env(safe-area-inset-bottom) 대응 | ✓ VERIFIED | layout.tsx 36행: `viewportFit: 'cover'`. BottomTabBar.tsx 22행: `height: calc(64px + env(...))` |
| P01-6 | BottomSheet open/close props 제어 | ✓ VERIFIED | BottomSheet.tsx: `interface BottomSheetProps { open, onClose, title, children }` + `Drawer.Root open={open}` |
| P01-7 | CompareFloatingBar BottomTabBar 위 위치 | ✓ VERIFIED | CompareFloatingBar.tsx 51행: `bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 16px)'` |
| P02-1 | 홈 페이지 모바일 단일 컬럼 | ✓ VERIFIED | page.tsx: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` 패턴 확인 |
| P02-2 | 홈 인라인 헤더 없음 | ✓ VERIFIED | `grep -c "<header" src/app/page.tsx` → 0 |
| P02-3 | 랭킹 칩 44px + 가로 스크롤 | ✓ VERIFIED | rankings/page.tsx: CHIP_CLASS `min-h-[44px]` (72행), overflow-x-auto (297·388행) |
| P02-4 | 랭킹 인라인 헤더 없음 | ✓ VERIFIED | `grep -c "<header" src/app/rankings/page.tsx` → 0 |
| P02-5 | 홈·랭킹 ISR revalidate 유지 | ✓ VERIFIED | page.tsx 21행: `revalidate = 60`, rankings/page.tsx 18행: `revalidate = 3600` |
| P02-6 | max-sm: 패턴 없음 | ✓ VERIFIED | 5개 대상 파일 전체 `grep -c "max-sm:"` → 0 |
| P02-7 | CSS 변수 색상 inline style 유지 | ✓ VERIFIED | rankings/page.tsx chipStyle() 함수: `background: 'var(--dj-orange)'` 패턴 유지 |
| P02-8 | 홈 버튼·링크 min-h-[44px] | ✓ VERIFIED | page.tsx 100행·127행: `min-h-[44px] inline-flex items-center` |
| P03-1 | 단지상세 모바일 단일/데스크탑 사이드바 | ✓ VERIFIED | complexes/[id]/page.tsx 385행: `grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:gap-6` |
| P03-2 | 단지상세 탭 Embla 스와이프 | ✓ CODE VERIFIED | DealTypeTabs.tsx: useEmblaCarousel, emblaRef, overflow-hidden, flex, min-w-full 확인 |
| P03-3 | 단지상세 인라인 헤더 없음 | ✓ VERIFIED | `grep -c "<header" src/app/complexes/[id]/page.tsx` → 0 |
| P03-4 | HagwonRecommendSheet BottomSheet 사용 | ✓ VERIFIED | BottomSheet import 3회, createPortal 0회 |
| P03-5 | 단지상세 revalidate=86400 유지 | ✓ VERIFIED | complexes/[id]/page.tsx 47행: `revalidate = 86400` |
| P03-6 | DealTypeTabs 스와이프 URL 상태 동기화 | ✗ FAILED | `const [active, setActive] = useState<DealTab>('sale')` (35행) — nuqs가 아닌 useState 사용. 탭 상태가 URL에 반영되지 않음. 매매/전세 간 URL 공유 불가. |
| P03-7 | 탭바 sticky top-14 | ✓ VERIFIED | DealTypeTabs.tsx 117행: `sticky top-14 z-30 bg-white border-b` |
| P03-8 | EducationCard BottomSheet 2회+ 사용 | ✓ VERIFIED | BottomSheet import 5회, createPortal 0회 |
| P03-9 | RedevelopmentSheet BottomSheet + 44px | ✓ VERIFIED | RedevelopmentSheet.tsx: `BottomSheet` 31행, `min-h-[44px]` 19행 |
| P04-1 | 분양 모바일 단일 컬럼 | ✓ VERIFIED | presale/page.tsx: `px-4 py-6 sm:px-6 sm:max-w-3xl sm:mx-auto`, 기존 grid-cols-1 유지 |
| P04-2 | 분양 인라인 헤더 없음 | ✓ VERIFIED | `grep -c "<header" src/app/presale/page.tsx` → 0, dj-logo 없음 |
| P04-3 | 투자 모바일 단일 컬럼 | ✓ VERIFIED | invest/page.tsx 145행: `px-4 py-6 sm:max-w-screen-lg sm:mx-auto` |
| P04-4 | 투자 인라인 헤더 없음 | ✓ VERIFIED | `grep -c "<header" src/app/invest/page.tsx` → 0, dj-logo 없음 |
| P04-5 | 분양·투자 필터 탭 44px | ✓ VERIFIED | invest/page.tsx 90행: `TAB_BASE_CLASS` = `... min-h-[44px]`. presale는 필터 칩 없음. |
| P04-6 | max-sm: 패턴 없음 | ✓ VERIFIED | presale·invest 모두 `grep -c "max-sm:"` → 0 |
| P04-7 | CSS 변수 색상 inline style 유지 | ✓ VERIFIED | invest/page.tsx tabStyle() 함수: CSS 변수 색상만 inline style 반환 |

**Plan must-have 종합 점수: 29/32** (P03-6 FAILED, SC3/SC4 UNCERTAIN)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `src/components/layout/AppHeader.tsx` | 56px 공유 헤더 | ✓ VERIFIED | `sticky top-0 z-50 h-14`, Bell 버튼 `w-11 h-11` (44px), `data-capture-hide="true"`, dj-logo |
| `src/components/layout/BottomTabBar.tsx` | 4탭 하단 네비 | ✓ VERIFIED | `'use client'`, `fixed bottom-0`, 4탭 TABS 배열, usePathname, `data-capture-hide="true"` |
| `src/components/ui/BottomSheet.tsx` | vaul 기반 바텀시트 | ✓ VERIFIED | `Drawer.Root open={open}`, Overlay z-[200], Content z-[201], 닫기 버튼 `aria-label="닫기"` |
| `src/app/layout.tsx` | 전역 레이아웃 통합 | ✓ VERIFIED | `viewportFit: 'cover'`, AppHeader+BottomTabBar 임포트·렌더링, `pb-[calc(64px+...)]` |
| `src/app/page.tsx` | 홈 mobile-first | ✓ VERIFIED | `revalidate=60`, 인라인 헤더 없음, `px-4`, `min-h-[44px]` 링크, max-sm: 없음 |
| `src/app/rankings/page.tsx` | 랭킹 mobile-first | ✓ VERIFIED | `revalidate=3600`, CHIP_CLASS `min-h-[44px]`, `overflow-x-auto`, 인라인 헤더 없음 |
| `src/app/complexes/[id]/page.tsx` | 단지상세 mobile-first | ✓ VERIFIED | `revalidate=86400`, `lg:grid-cols-[1fr_360px]`, 인라인 헤더 없음 |
| `src/components/complex/DealTypeTabs.tsx` | Embla 스와이프 탭 | ✓ VERIFIED | `useEmblaCarousel`, `overflow-hidden flex`, `min-w-full` 슬라이드, 탭버튼 `min-h-[44px]` |
| `src/components/complex/HagwonRecommendSheet.tsx` | BottomSheet 전환 | ✓ VERIFIED | BottomSheet 3회, createPortal 0회 |
| `src/components/complex/EducationCard.tsx` | SchoolDetailSheet + 순위 BottomSheet | ✓ VERIFIED | BottomSheet 5회, createPortal 0회 |
| `src/components/complex/RedevelopmentSheet.tsx` | 재건축 BottomSheet 래퍼 | ✓ VERIFIED | 신규 파일, `'use client'`, BottomSheet, 트리거 버튼 `min-h-[44px]` |
| `src/app/presale/page.tsx` | 분양 mobile-first | ✓ VERIFIED | `dynamic='force-dynamic'`, `px-4`, 인라인 헤더 없음 |
| `src/app/invest/page.tsx` | 투자 mobile-first | ✓ VERIFIED | `revalidate=3600`, `min-h-[44px]` 필터 탭, `overflow-x-auto`, 인라인 헤더 없음 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `layout.tsx` | `AppHeader.tsx` | import + JSX | ✓ WIRED | 5행 import, 58행 `<AppHeader />` |
| `layout.tsx` | `BottomTabBar.tsx` | import + JSX | ✓ WIRED | 6행 import, 65행 `<BottomTabBar />` |
| `BottomTabBar.tsx` | `usePathname` | next/navigation | ✓ WIRED | 4행 import, 15행 사용, active 감지 로직 |
| `DealTypeTabs.tsx` | `useEmblaCarousel` | embla-carousel-react | ✓ WIRED | 5행 import, 56행 hook 초기화, 163행 `ref={emblaRef}` |
| `DealTypeTabs.tsx` | `emblaApi.on('select')` | Embla event → setActive | ⚠️ PARTIAL | 70행 연결, 그러나 `setActive`가 nuqs가 아닌 useState 업데이트. URL 동기화 없음. |
| `HagwonRecommendSheet.tsx` | `BottomSheet.tsx` | import + JSX | ✓ WIRED | BottomSheet 3회 사용, createPortal 제거 확인 |
| `EducationCard.tsx` | `BottomSheet.tsx` | import + JSX | ✓ WIRED | BottomSheet 5회 사용, createPortal 제거 확인 |
| `RedevelopmentSheet.tsx` | `BottomSheet.tsx` | import + JSX | ✓ WIRED | 4행 import, 31행 `<BottomSheet>` |
| `complexes/[id]/page.tsx` | `RedevelopmentSheet.tsx` | import + JSX | ✓ WIRED | 21행 import, 833행 `<RedevelopmentSheet>` |

---

### Data-Flow Trace (Level 4)

동적 데이터 렌더링 컴포넌트 (Level 4):

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `DealTypeTabs.tsx` | `rawSaleData`, `rawJeonseData` | props (RSC page.tsx에서 전달) | Yes — Supabase 트랜잭션 데이터 | ✓ FLOWING |
| `BottomSheet.tsx` | `children` (슬롯) | 호출 측에서 전달 | Yes — 각 컴포넌트 실제 데이터 | ✓ FLOWING |
| `RedevelopmentSheet.tsx` | `phase`, `notes` | RSC page.tsx props | Yes — complexes 테이블 컬럼 | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| AppHeader 파일 존재·내용 | `grep "data-capture-hide" AppHeader.tsx` | `data-capture-hide="true"` 9행 | ✓ PASS |
| BottomTabBar 4탭 렌더링 | `grep "label: '홈'" BottomTabBar.tsx` | TABS 배열 4항목 확인 | ✓ PASS |
| BottomSheet vaul 연결 | `grep "Drawer.Root" BottomSheet.tsx` | `Drawer.Root open={open}` 15행 | ✓ PASS |
| ISR 보존 (5페이지) | revalidate/dynamic export 존재 | 5개 페이지 모두 확인 | ✓ PASS |
| createPortal 제거 | `grep -c "createPortal" HagwonRecommend·EducationCard` | 0·0 | ✓ PASS |
| Embla swipe 실제 동작 | 브라우저 swipe 테스트 필요 | 실행 불가 | ? SKIP |
| 375px 가로 스크롤 없음 | 브라우저 375px DevTools 필요 | 실행 불가 | ? SKIP |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|-------------|-------------|--------|---------|
| MOB-01 | 29-01 | AppHeader + BottomTabBar → layout.tsx 통합 | ✓ SATISFIED | layout.tsx에 양 컴포넌트 통합 완료 |
| MOB-02 | 29-02 | 홈 페이지 mobile-first, 44px | ✓ SATISFIED | grid-cols-1, px-4, min-h-[44px], 인라인 헤더 제거 |
| MOB-03 | 29-02 | 랭킹 페이지 44px 칩, 가로 스크롤 | ✓ SATISFIED | CHIP_CLASS min-h-[44px], overflow-x-auto |
| MOB-04 | 29-03 | 단지상세 탭 스와이프, 바텀시트 전환 | ✓ SATISFIED | Embla 연결, 3개 시트 BottomSheet 전환 |
| MOB-05 | 29-04 | 분양·투자 mobile-first | ✓ SATISFIED | px-4, 인라인 헤더 제거, 44px 필터 탭 |
| MOB-06 | 29-01/03 | 공유 BottomSheet 컴포넌트화 | ✓ SATISFIED | BottomSheet.tsx 신규, 3개 컴포넌트 전환 |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|---------|--------|
| `DealTypeTabs.tsx` | 153 | `minHeight: 32` (기간 필터) | ⚠️ Warning | ROADMAP SC2 "모든 버튼·링크·칩 44px" 부분 미충족. 기간 선택 버튼 32px. |
| `DealTypeTabs.tsx` | 188, 223 | `minHeight: 32` (평형 필터 칩) | ⚠️ Warning | 위와 동일. 매매·전세 평형 선택 칩 32px. |
| `DealTypeTabs.tsx` | 35 | `useState<DealTab>('sale')` | ⚠️ Warning | 탭 상태가 URL에 반영되지 않음. Plan must_have "nuqs URL 상태 동기화" 미충족. 탭 상태 공유/북마크 불가. |

---

### Human Verification Required

#### 1. 단지상세 탭 스와이프 동작

**테스트:** 모바일 브라우저(또는 Chrome DevTools 375px)에서 단지상세 페이지 진입 → 거래내역 탭 영역에서 좌우 스와이프
**예상:** 매매↔전세 슬라이드가 swipe gesture로 전환되어야 함. 탭 버튼 텍스트도 하이라이트 전환.
**왜 사람이 필요한가:** Embla Carousel 코드는 올바르게 구현되어 있으나(useEmblaCarousel, emblaApi.on('select'), min-w-full 슬라이드) jsdom 환경에서 touch event 시뮬레이션 불가.

#### 2. 375px 뷰포트 가로 스크롤 없음

**테스트:** Chrome DevTools에서 375px iPhone SE 모드로 다음 5개 페이지 각각 확인: `/`, `/rankings`, `/complexes/[아무 단지 slug]`, `/presale`, `/invest`
**예상:** 각 페이지에서 수평 스크롤바가 없어야 함. 모든 콘텐츠가 375px 내에 정상 렌더링.
**왜 사람이 필요한가:** max-sm: 패턴 0건, overflow-x-auto 스코핑 확인 완료이지만 실제 CSS 렌더링 결과는 브라우저 확인 필요. 특히 inline style 레이아웃이 일부 남아 있는 섹션 확인 필요.

#### 3. 빌드·린트·테스트 통과

**테스트:** 프로젝트 루트에서 `npm run lint && npm run build && npm run test` 순서 실행
**예상:** ESLint 에러 0건, Next.js 빌드 성공(exit 0), Vitest AppHeader/BottomTabBar/BottomSheet 테스트 3종 GREEN
**왜 사람이 필요한가:** 검증 세션에서 빌드 실행 환경 없음. 29-04-SUMMARY에 빌드 성공 기록 있으나 최신 커밋(a81270c, code review fixes) 이후 상태 독립 미확인.

---

### Gaps Summary

**확정 FAILED (1건):**

**P03-6: DealTypeTabs 탭 상태 URL 동기화 미구현**
- Plan 03 must_have: "DealTypeTabs의 스와이프가 nuqs URL 상태와 동기화된다"
- 실제 구현: `const [active, setActive] = useState<DealTab>('sale')` — nuqs 미사용
- 영향: 매매/전세 탭 상태가 URL에 반영되지 않아 특정 탭 URL 공유/북마크 불가
- ROADMAP SC3("단지상세 탭을 좌우 스와이프로 전환할 수 있다")는 충족. 이 gap은 plan-level 추가 요구사항.

**경고 (2건):**

1. **DealTypeTabs 보조 필터 32px**: 기간 필터(1년/3년/5년/전체)·평형 칩 32px. ROADMAP SC2 "모든 버튼·링크·칩 44px" 문자적 미충족. Plan 03 task 2a 기준(탭 버튼만 44px)은 충족.
2. **SC5 빌드·테스트 미독립검증**: SUMMARY 기준 통과, 독립 실행 미확인.

**HUMAN 검증 필요 (3건):**
- SC3 swipe 동작
- SC4 375px 가로 스크롤
- SC5 lint/build/test

---

_Verified: 2026-06-23_
_Verifier: Claude (gsd-verifier)_
