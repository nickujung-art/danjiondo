# Phase 19 — 어드민 UI/UX 전면 개선 ✅ 완료 (2026-05)

## 구현 내용
- `src/app/admin/layout.tsx` (RSC): auth guard + Promise.all 3개 pending 카운트 병렬 조회 + 사이드바 렌더
- `/admin` 루트 → `/admin/status` 리다이렉트 (`src/app/admin/page.tsx`)
- `AdminSidebar` (RSC): 9개 메뉴 텍스트만, pending 카운트 뱃지 (0이면 숨김, >99 → '99+')
- `AdminSidebarLinks` ('use client'): `usePathname` 기반 active 스타일 (font-weight 700 + var(--bg-surface-2))
- `AdminSidebarDrawer` ('use client'): 768px 이하 모바일 overlay drawer, SVG 햄버거, 경로 변경 시 자동 닫힘
- 기존 9개 어드민 페이지 자체 `<header>` 제거 (gps-requests는 원래 없었음)
- 회원/신고/광고/중개사 목록에 URL searchParams 기반 검색·필터 추가

## 특이사항 / 유지보수
- 편집 서브페이지(`ads/new`, `ads/[id]/edit`, `realtors/new`, `realtors/[id]/edit`)는 레이아웃 범위 밖 — 자체 헤더 남아있음
- pending 뱃지 카운트 대상: `reports`, `ad_campaigns`, `gps_verification_requests` (WHERE status='pending')
- `layout.tsx`는 `revalidate = 0` — 항상 최신 pending 카운트
- defense-in-depth: 기존 각 페이지 auth guard도 유지됨
- 핵심 파일: `src/app/admin/layout.tsx`, `src/components/admin/AdminSidebar.tsx`, `src/components/admin/AdminSidebarLinks.tsx`, `src/components/admin/AdminSidebarDrawer.tsx`
