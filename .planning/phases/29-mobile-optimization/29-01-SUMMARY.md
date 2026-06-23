---
phase: 29-mobile-optimization
plan: "01"
subsystem: layout-components
tags: [mobile, layout, bottom-tab-bar, app-header, bottom-sheet, vaul, tdd-green]
dependency_graph:
  requires:
    - Plan 00 (RED 테스트 스텁)
  provides:
    - AppHeader (src/components/layout/AppHeader.tsx)
    - BottomTabBar (src/components/layout/BottomTabBar.tsx)
    - BottomSheet (src/components/ui/BottomSheet.tsx)
    - 전역 레이아웃 통합 (src/app/layout.tsx)
    - CompareFloatingBar 위치 보정
  affects:
    - 모든 페이지 (AppHeader + BottomTabBar가 layout.tsx에 통합됨)
    - Plan 02~06 (이 인프라 위에서 page.tsx 재작성 진행)
tech_stack:
  added:
    - vaul@1.1.2 (BottomSheet Drawer.Root 기반)
    - embla-carousel-react@8.6.0 (Plan 03 단지상세 탭 스와이프 준비)
  patterns:
    - TDD GREEN phase (Plan 00 RED 테스트 → GREEN 전환)
    - usePathname active detection (AdminSidebarLinks 패턴)
    - data-capture-hide attribute (html2canvas 캡처 제외)
    - env(safe-area-inset-bottom) iOS safe area 대응
    - viewportFit: 'cover' Next.js Viewport export
key_files:
  created:
    - src/components/layout/AppHeader.tsx
    - src/components/layout/BottomTabBar.tsx
    - src/components/ui/BottomSheet.tsx
  modified:
    - src/app/layout.tsx (viewportFit, AppHeader, BottomTabBar 통합)
    - src/components/complex/CompareFloatingBar.tsx (bottom 오프셋 보정)
    - package.json (vaul, embla-carousel-react 추가)
    - src/components/rankings/ShareButton.tsx (pre-existing TS 에러 수정)
decisions:
  - "vaul 기반 BottomSheet 채택 — Drawer.Portal 패턴, 3+ 바텀시트 대응 (happy-dom에서도 portal content 렌더링 확인됨)"
  - "Footer는 layout.tsx에서 hidden sm:block 래퍼로 모바일 숨김 처리 (Footer.tsx 파일 자체는 수정 안 함)"
  - "AppHeader/BottomTabBar는 RSC인 layout.tsx에서 import — 자체 'use client'이므로 layout.tsx는 RSC 유지"
metrics:
  duration: "~15분"
  completed_date: "2026-06-23"
  tasks_completed: 3
  files_created: 3
  files_modified: 4
---

# Phase 29 Plan 01: 공유 레이아웃 인프라 Summary

**One-liner:** AppHeader(56px sticky) + BottomTabBar(4탭 fixed) + BottomSheet(vaul Drawer) 신규 생성, layout.tsx에 통합, iOS safe-area 완전 대응.

## What Was Built

Plan 00의 RED 테스트 3종을 GREEN으로 전환하며 모바일 네비게이션 셸 인프라를 완성했다.

### Task 1: 패키지 설치

- `vaul@1.1.2` — Drawer.Root/Portal/Overlay/Content 기반 BottomSheet
- `embla-carousel-react@8.6.0` — Plan 03 단지상세 탭 스와이프 준비 (이번 플랜에서는 미사용)

### Task 2: 신규 컴포넌트 3종 (TDD GREEN)

**AppHeader** (`src/components/layout/AppHeader.tsx`)
- `sticky top-0 z-50 h-14` (56px)
- 로고: `dj-logo` + `mark` CSS 클래스 (globals.css 기존 브랜드 아이덴티티)
- 알림 버튼: `Bell` lucide-react, `w-11 h-11` (44px 터치 타겟), `aria-label="알림"`
- `data-capture-hide="true"` — html2canvas ShareButton 캡처 제외

**BottomTabBar** (`src/components/layout/BottomTabBar.tsx`)
- `fixed bottom-0 z-40`, `height: calc(64px + env(safe-area-inset-bottom, 0px))`
- 4탭: 홈(`/`) / 랭킹(`/rankings`) / 분양(`/presale`) / MY(`/profile`)
- active 감지: `pathname === '/'` (홈), `pathname.startsWith(href)` (나머지)
- active: `color: var(--dj-orange)`, inactive: `color: var(--fg-sec)`
- `data-capture-hide="true"`

**BottomSheet** (`src/components/ui/BottomSheet.tsx`)
- vaul `Drawer.Root open={open} onOpenChange={(v) => !v && onClose()}`
- overlay: `z-[200]`, content: `z-[201] rounded-t-[20px] max-h-[90dvh]`
- props: `{ open, onClose, title, children }`
- 닫기 버튼: `X` lucide-react, `aria-label="닫기"`, `w-11 h-11`

### Task 3: layout.tsx 통합 + CompareFloatingBar 보정

**layout.tsx 변경 4가지:**
1. `viewportFit: 'cover'` — iOS `env(safe-area-inset-bottom)` 활성화
2. `AppHeader`, `BottomTabBar` import 추가
3. `body` className: `pb-[calc(64px+env(safe-area-inset-bottom,0px))]`
4. 컴포넌트 순서: `AppHeader` → `NuqsAdapter > {children}` → `Footer(hidden sm:block)` → `BottomTabBar`

**CompareFloatingBar.tsx:**
- `bottom: 80` → `bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 16px)'`

## Commits

| Hash | Message |
|------|---------|
| d30ad15 | chore(29-01): install vaul@1.1.2 and embla-carousel-react@8.6.0 |
| 208e579 | feat(29-01): implement AppHeader, BottomTabBar, BottomSheet components (TDD GREEN) |
| 74da7a2 | feat(29-01): integrate AppHeader+BottomTabBar into layout, fix CompareFloatingBar offset |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ShareButton.tsx pre-existing TypeScript error**
- **Found during:** Task 2 TypeScript 검증 단계
- **Issue:** `ShareButton.tsx:103` — `parseInt(fsMatch[1])` 에서 `string | undefined` → `string` 타입 미스매치
- **Fix:** `parseInt(fsMatch[1]!)` 비-null 단언 추가 (regex 캡처 그룹 1은 match 시 항상 존재)
- **Files modified:** `src/components/rankings/ShareButton.tsx`
- **Commit:** 208e579 (feat 커밋에 포함)

## Known Stubs

없음 — 이 플랜의 컴포넌트는 모두 완전 구현됨.
- AppHeader 알림 버튼: 클릭 시 동작 없음 (href="/notifications" 추가는 Plan 02 범위) → UX 스텁이 아닌 의도된 단계적 구현
- BottomSheet: 드래그 제스처는 vaul이 내부적으로 처리

## Threat Flags

없음 — 신규 API 엔드포인트/auth 경로/외부 네트워크 호출 없음. BottomTabBar의 `/profile` 링크는 기존 auth guard가 미인증 처리.

## Self-Check: PASSED

- [x] `src/components/layout/AppHeader.tsx` 존재
- [x] `src/components/layout/BottomTabBar.tsx` 존재
- [x] `src/components/ui/BottomSheet.tsx` 존재
- [x] `src/app/layout.tsx` — `viewportFit: 'cover'`, `AppHeader`, `BottomTabBar`, `pb-[calc(...)]` 모두 존재
- [x] `CompareFloatingBar.tsx` — `calc(64px + env(safe-area-inset-bottom, 0px) + 16px)` 존재
- [x] `npx tsc --noEmit` 통과 (에러 없음)
- [x] AppHeader 테스트 4/4 PASS
- [x] BottomTabBar 테스트 5/5 PASS
- [x] BottomSheet 테스트 3/3 PASS
- [x] 커밋 d30ad15, 208e579, 74da7a2 모두 존재
