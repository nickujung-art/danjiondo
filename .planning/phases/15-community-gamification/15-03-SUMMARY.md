---
phase: 15
plan: "03"
subsystem: ui-layer
tags: [compare, tier-badge, cafe-articles, recharts, nuqs]
dependency_graph:
  requires: [15-01, 15-02]
  provides: [compare-chart, tier-badge, cafe-articles-ui, management-cost-compare]
  affects: [compare-page, complex-detail-page, compare-table]
tech_stack:
  added: [recharts-line-chart, nuqs-client-read, dynamic-import-client-wrapper]
  patterns: [tdd-red-green, pure-function-extraction, server-component-dynamic-import]
key_files:
  created:
    - src/lib/data/compare.test.ts
    - src/components/complex/TierBadge.tsx
    - src/components/complex/CompareFloatingBar.tsx
    - src/app/compare/CompareChart.tsx
    - src/app/compare/CompareChartWrapper.tsx
  modified:
    - src/lib/data/compare.ts
    - src/app/complexes/[id]/page.tsx
    - src/app/compare/page.tsx
    - src/components/complex/CompareTable.tsx
    - src/__tests__/compare.test.ts
decisions:
  - "CompareChart wrapped in client component (CompareChartWrapper) because ssr:false is disallowed in Server Components"
  - "CompareFloatingBar uses storedIds state to avoid urlIds stale closure in useEffect"
  - "CafeArticlesSection inlined in complex detail page (no separate file) — matches plan spec"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-22"
  tasks_completed: 2
  files_created: 5
  files_modified: 5
---

# Phase 15 Plan 03: UI Layer Summary

Wave 3 UI layer for community gamification — compare page chart, TierBadge component, and cafe articles section swap.

## What Was Done

### T-15-04: compare.ts extension + TierBadge + cafe section swap (TDD)

**RED phase (commit 639228e):** Wrote failing tests for `computePriceHistory` and `computeManagementCostAvg` in `src/lib/data/compare.test.ts`.

**GREEN phase (commit e4f7769):**
- Extended `ComplexSummary` interface with `managementCostAvg: number | null` and `priceHistory: Array<{yearMonth, avgPrice}>` fields
- Exported two pure functions: `computeManagementCostAvg` and `computePriceHistory`
- Added two parallel queries in `getCompareData` for management cost (12 months) and price history (1 year, cancel_date/superseded_by excluded per CLAUDE.md CRITICAL)
- Created `TierBadge` component — presentational, no 'use client', uses text abbreviations only (D-06 AI slop prohibition)
- Swapped `CafePostsList` / `getCafePostsByComplex` with inline `CafeArticlesSection` / `getCafeArticlesByComplex` in complex detail page

### T-15-05: CompareFloatingBar + compare page chart + management cost row (commit 4c06b87)

- `CompareFloatingBar`: 'use client', nuqs readonly, syncs to localStorage, fixed button (bottom-right), only shows when 2+ items selected
- `CompareChart`: recharts LineChart for 1-year price history, multiple lines per complex, LINE_COLORS array (no purple/indigo per AI slop rules)
- `CompareChartWrapper`: thin 'use client' component wrapping dynamic import with `ssr: false` (required because Server Components forbid `ssr: false` in dynamic imports directly)
- `CompareTable`: added management_cost row to ROWS array

## Test Results

All compare-related tests pass (8/8):
- `src/__tests__/compare.test.ts` — 4 tests (existing + mock updated)
- `src/lib/data/compare.test.ts` — 4 tests (new RED/GREEN)

Pre-existing failing test `src/lib/data/complexes-map.test.ts` (2 failures) exists on main — out of scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing compare test mock missing chain methods**
- **Found during:** Step 2 (GREEN phase)
- **Issue:** Existing `src/__tests__/compare.test.ts` mock lacked `.order()`, `.limit()`, `.is()`, `.gte()` methods — new management cost and price history queries broke the test
- **Fix:** Added missing mock chain methods to the mock object in the existing test
- **Files modified:** `src/__tests__/compare.test.ts`
- **Commit:** e4f7769

**2. [Rule 3 - Blocking] Fixed ssr:false in Server Component**
- **Found during:** Step 7 (compare/page.tsx dynamic import)
- **Issue:** Next.js 15 disallows `ssr: false` in `next/dynamic` inside Server Components
- **Fix:** Created `CompareChartWrapper.tsx` as 'use client' wrapper component; updated compare/page.tsx to import wrapper
- **Files modified:** Created `src/app/compare/CompareChartWrapper.tsx`, updated `src/app/compare/page.tsx`
- **Commit:** 4c06b87

**3. [Rule 3 - Blocking] Missing font file in worktree**
- **Found during:** Step 9 (build gate)
- **Issue:** `public/fonts/PretendardVariable.woff2` missing from worktree (tracked on main but not in worktree git index)
- **Fix:** Copied font file from main repo to worktree
- **Files modified:** `public/fonts/PretendardVariable.woff2` (copied, not committed — binary file not in scope)

**4. [Rule 1 - Bug] Fixed useEffect missing dependency in CompareFloatingBar**
- **Found during:** npm run lint
- **Issue:** `urlIds` derived value referenced inside `useEffect` without being in dependency array
- **Fix:** Moved `urlIds` computation inside the effect; extracted `storedIds` state for the Link href
- **Files modified:** `src/components/complex/CompareFloatingBar.tsx`
- **Commit:** 4c06b87

## TDD Gate Compliance

- RED gate commit: `639228e` (`test(15-04): write failing compare tests (RED)`) — PASS
- GREEN gate commit: `e4f7769` (`feat(15-04): TierBadge + compare.ts extension + cafe section swap`) — PASS

## Known Stubs

None — all data is wired to real Supabase queries.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check

Files created/modified verified present in filesystem. All commits verified in git log.
