---
phase: 32
plan: "32-01"
subsystem: admin/cardnews
tags: [admin, cardnews, dashboard, ui]
dependency_graph:
  requires: []
  provides: [admin-cardnews-unified-dashboard]
  affects: [admin-sidebar, cardnews-scheduler-route]
tech_stack:
  added: []
  patterns: [RSC-to-client-props, component-reuse-import]
key_files:
  created:
    - src/components/admin/cardnews/CardnewsDashboardClient.tsx
  modified:
    - src/app/admin/cardnews/page.tsx
    - src/components/admin/AdminSidebar.tsx
    - src/app/admin/cardnews/scheduler/page.tsx
decisions:
  - "scheduler page replaced with redirect (page-level, no next.config.js) for immediate coverage without auth gate"
  - "CardnewsDashboardClient uses sectionLabelStyle constant to avoid inline style duplication across 4 section headers"
  - "rank-1 item in TOP5 list uses var(--dj-orange) per UI_GUIDE accent convention"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-26"
  tasks_completed: 4
  files_changed: 4
---

# Phase 32 Plan 01: 카드뉴스 관리 대시보드 통합 Summary

## One-liner

Unified `/admin/cardnews` dashboard embedding SchedulerPanel + CardnewsDownloadButton + TOP5 ranked list + GitHub Actions log link in a single 4-section RSC→client page.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | AdminSidebar: '카드뉴스 목록' → '카드뉴스 관리', removed '스케줄러' entry | d176569 |
| 2 | Created CardnewsDashboardClient.tsx (4-section client component) | d176569 |
| 3 | Rewrote /admin/cardnews/page.tsx (RSC: auth + topDeals fetch + client render) | d176569 |
| 4 | Replaced /admin/cardnews/scheduler/page.tsx with redirect to /admin/cardnews | d176569 |

## Verification Results

- `grep -n "스케줄러" src/components/admin/AdminSidebar.tsx` → no output (removed)
- `grep -n "카드뉴스 관리" src/components/admin/AdminSidebar.tsx` → line 25 (present)
- `grep -n "redirect" src/app/admin/cardnews/scheduler/page.tsx` → line 1, 4 (redirect only)
- `npm run build` → Compiled successfully in 37.2s, 0 errors, 69 pages generated

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All data is wired from the RSC Supabase query to the client component props.

## Threat Flags

None. No new network endpoints or auth paths introduced. Existing auth pattern (`createSupabaseServerClient → getUser → profile.role check`) retained in page.tsx.

## Self-Check: PASSED

- src/components/admin/cardnews/CardnewsDashboardClient.tsx: FOUND
- src/app/admin/cardnews/page.tsx: FOUND (rewritten)
- src/components/admin/AdminSidebar.tsx: FOUND (updated)
- src/app/admin/cardnews/scheduler/page.tsx: FOUND (redirect only)
- commit d176569: FOUND
