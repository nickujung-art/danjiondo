---
phase: 29-mobile-optimization
plan: "00"
subsystem: layout-components
tags: [tdd, red-tests, mobile, layout, bottom-sheet]
dependency_graph:
  requires: []
  provides:
    - AppHeader RED 테스트 스텁 (src/components/layout/AppHeader.test.tsx)
    - BottomTabBar RED 테스트 스텁 (src/components/layout/BottomTabBar.test.tsx)
    - BottomSheet RED 테스트 스텁 (src/components/ui/BottomSheet.test.tsx)
  affects:
    - Plan 01 (컴포넌트 구현 시 이 테스트들이 GREEN으로 전환됨)
tech_stack:
  added: []
  patterns:
    - TDD RED phase (컴포넌트 import 에러로 의도적 실패)
    - Vitest + @testing-library/react
    - vi.mock('next/navigation') for usePathname
key_files:
  created:
    - src/components/layout/AppHeader.test.tsx
    - src/components/layout/BottomTabBar.test.tsx
    - src/components/ui/BottomSheet.test.tsx
  modified: []
decisions:
  - "BottomSheet 테스트는 open=true 조건에서 title/children 렌더링과 닫기 버튼 onClose만 검증 (happy-dom에서 portal 완전 동작 불보장)"
  - "BottomTabBar 테스트에 vi.mock('next/navigation') 추가 — usePathname 의존성 격리"
metrics:
  duration: "~5분"
  completed_date: "2026-06-23"
  tasks_completed: 1
  files_created: 3
  files_modified: 0
---

# Phase 29 Plan 00: 신규 레이아웃 컴포넌트 RED 테스트 스텁 Summary

**One-liner:** AppHeader·BottomTabBar·BottomSheet의 TDD RED 테스트 스텁 3종 — 컴포넌트 미구현으로 import 에러 발생, 의도된 RED 상태.

## What Was Built

TDD 프로세스의 첫 단계(RED)로, Plan 01에서 구현할 세 컴포넌트의 기대 동작을 테스트로 먼저 명세했다.

### 테스트 파일 3개 생성

**`src/components/layout/AppHeader.test.tsx`** (4개 테스트)
- `renders without crashing`
- `has aria-label "상단 헤더"` — `getByRole('banner', { name: '상단 헤더' })`
- `has data-capture-hide attribute` — `container.querySelector('[data-capture-hide="true"]')`
- `contains 알림 button` — `getByRole('button', { name: '알림' })`

**`src/components/layout/BottomTabBar.test.tsx`** (5개 테스트)
- `renders without crashing`
- `has aria-label "하단 탭 네비게이션"` — `getByRole('navigation', { name: '하단 탭 네비게이션' })`
- `has data-capture-hide attribute`
- `renders exactly 4 tab links` — `getAllByRole('link')` → length 4
- `renders 홈/랭킹/분양/MY labels`

**`src/components/ui/BottomSheet.test.tsx`** (3개 테스트)
- `renders title when open`
- `renders children when open=true`
- `calls onClose when close button is clicked` — `getByRole('button', { name: '닫기' })` + `fireEvent.click`

### RED 상태 검증

```
Test Files  3 failed (3)
      Tests  no tests
```

세 파일 모두 `Failed to resolve import` 에러로 실패 — 컴포넌트 파일이 없으므로 정상적인 RED 상태.

## Commits

| Hash | Message |
|------|---------|
| a6fb396 | test(29-00): add failing RED tests for AppHeader, BottomTabBar, BottomSheet |

## Deviations from Plan

None — 플랜에 명세된 테스트 코드를 그대로 작성했다.

## TDD Gate Compliance

- RED gate commit: `a6fb396` (test(29-00): ...) — 확인됨
- GREEN gate: Plan 01에서 수행 예정

## Known Stubs

없음 — 이 플랜은 테스트 파일만 생성. 구현 파일 없음.

## Threat Flags

없음 — 테스트 파일은 프로덕션 번들에 포함되지 않음.

## Self-Check: PASSED

- [x] src/components/layout/AppHeader.test.tsx 존재
- [x] src/components/layout/BottomTabBar.test.tsx 존재
- [x] src/components/ui/BottomSheet.test.tsx 존재
- [x] 커밋 a6fb396 존재
- [x] 세 파일 모두 RED 상태 (3 failed, 0 passed)
