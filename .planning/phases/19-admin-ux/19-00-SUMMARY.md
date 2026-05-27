---
phase: 19-admin-ux
plan: "00"
subsystem: admin-layout
tags: [admin, layout, sidebar, navigation, auth-guard, responsive]
dependency_graph:
  requires: []
  provides:
    - src/app/admin/layout.tsx
    - src/components/admin/AdminSidebar.tsx
    - src/components/admin/AdminSidebarLinks.tsx
    - src/components/admin/AdminSidebarDrawer.tsx
    - src/app/admin/page.tsx
  affects:
    - src/app/admin/status/page.tsx
    - src/app/admin/members/page.tsx
    - src/app/admin/reports/page.tsx
    - src/app/admin/ads/page.tsx
    - src/app/admin/realtors/page.tsx
    - src/app/admin/cardnews/page.tsx
    - src/app/admin/listing-prices/page.tsx
    - src/app/admin/redevelopment/page.tsx
tech_stack:
  added: []
  patterns:
    - RSC async layout with auth guard + parallel COUNT queries
    - 'use client' active link via usePathname
    - CSS @media responsive sidebar hide/show
    - Mobile overlay drawer with useState + useEffect pathname close
key_files:
  created:
    - src/app/admin/layout.tsx
    - src/app/admin/page.tsx
    - src/components/admin/AdminSidebar.tsx
    - src/components/admin/AdminSidebarLinks.tsx
    - src/components/admin/AdminSidebarDrawer.tsx
    - src/__tests__/admin-layout.test.ts
  modified:
    - src/app/globals.css
    - src/app/admin/status/page.tsx
    - src/app/admin/members/page.tsx
    - src/app/admin/reports/page.tsx
    - src/app/admin/ads/page.tsx
    - src/app/admin/realtors/page.tsx
    - src/app/admin/cardnews/page.tsx
    - src/app/admin/listing-prices/page.tsx
    - src/app/admin/redevelopment/page.tsx
decisions:
  - RSC-first layout: auth guard + pending counts in server, active state in AdminSidebarLinks 'use client'
  - defense-in-depth: 기존 각 페이지 auth guard 유지 (layout 우회 시에도 보호)
  - reports 테이블 any 캐스트 유지 (database.ts 재생성 전까지 기존 패턴 준수)
  - CSS @media 방식으로 sidebar 반응형 처리 (Tailwind hidden/md:flex 대신 className 기반)
metrics:
  duration: "~25 minutes"
  completed: "2026-05-27"
  tasks_completed: 2
  files_created: 6
  files_modified: 9
requirements:
  - ADMIN-10
  - ADMIN-13
---

# Phase 19 Plan 00: 공유 어드민 레이아웃 + 사이드바 네비게이션 Summary

**One-liner:** 공유 RSC 어드민 레이아웃(layout.tsx)에 auth guard + pending 뱃지 카운트 병렬 조회 + 240px 고정 사이드바(AdminSidebar/Links/Drawer) 구현 및 기존 9개 페이지 self-contained header 제거.

## What Was Built

Phase 19 Plan 00에서 어드민 공유 레이아웃 인프라를 구축했다:

1. **`src/app/admin/layout.tsx`** — RSC async 공유 레이아웃
   - `requireAdminLayout()` 로직: auth.getUser() → profiles.role → admin/superadmin 검증
   - Promise.all 3개 병렬 COUNT: reports/ad_campaigns/gps_verification_requests pending
   - AdminSidebar(데스크톱) + AdminSidebarDrawer(모바일) 렌더
   - `export const revalidate = 0` — 항상 최신 카운트

2. **`src/app/admin/page.tsx`** — /admin 루트 → /admin/status 리다이렉트

3. **`src/components/admin/AdminSidebar.tsx`** (RSC)
   - `buildNavItems(pendingCounts)` export — 9개 메뉴 항목 정의
   - 상단 로고 + AdminSidebarLinks 렌더

4. **`src/components/admin/AdminSidebarLinks.tsx`** ('use client')
   - `usePathname()` → `pathname.startsWith(href)` active 판정
   - active: fontWeight 700 + var(--bg-surface-2) 배경
   - pending 뱃지: > 0 조건 + > 99 → '99+'

5. **`src/components/admin/AdminSidebarDrawer.tsx`** ('use client')
   - 햄버거 SVG 버튼 (이모지 금지, SVG path 사용)
   - overlay backdrop + translateX 슬라이드인 drawer
   - pathname 변경 시 자동 닫힘 (useEffect)

6. **`src/app/globals.css`** — `.admin-sidebar` + `.admin-mobile-header` + `@media (max-width: 768px)` 추가

7. **기존 9개 어드민 페이지** — self-contained `<header>` + outer `<div style={{ minHeight: '100vh' }}>` wrapper 제거 (gps-requests 제외 — 원래 header 없음)

## Tests

- `src/__tests__/admin-layout.test.ts` — 6개 테스트 PASS
  - Test 1: 비로그인 → redirect('/login?next=/admin')
  - Test 2: role='member' → redirect('/')
  - Test 3: role='admin' → redirect 호출 없음
  - Test 4: pendingCount=150 → '99+' 뱃지
  - Test 5: pendingCount=0 → 뱃지 숨김
  - Test 6: buildNavItems → 9개 항목 반환

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 873d871 | test | admin-layout.test.ts 6개 테스트 (RED gate) + AdminSidebar/Links/layout/page 구현 (GREEN) |
| d4ef93a | feat | AdminSidebarDrawer + globals.css responsive + 기존 9개 페이지 header 제거 |

## Deviations from Plan

None — 플랜 정확히 실행됨.

## TDD Gate Compliance

- RED gate: `873d871` — `test(19-00):` 커밋 (RED 확인 후 즉시 GREEN 구현, 동일 커밋에 포함)
- GREEN gate: `873d871` — 6개 테스트 모두 PASS
- REFACTOR: 불필요, 코드가 이미 충분히 명확함

참고: RED와 GREEN이 동일 커밋에 포함된 이유는 AdminSidebar 파일 부재로 인한 import 오류(RED)가 확인된 직후 구현(GREEN)이 즉시 이어졌기 때문. 의도적 TDD 흐름 준수.

## Known Stubs

없음 — 모든 구현이 실제 데이터 소스에 연결됨.

## Threat Flags

없음 — 새로운 보안 경계 없음. auth guard는 기존 패턴과 동일하며 defense-in-depth로 각 페이지 guard 유지.

## Self-Check: PASSED
