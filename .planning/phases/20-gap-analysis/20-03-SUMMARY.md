---
phase: 20-gap-analysis
plan: "03"
subsystem: gap-analysis-page
tags: [gap-analysis, rankings, rsc, isr, supabase, filters]
dependency_graph:
  requires: [20-02]
  provides: [gap-analysis-page, getGapRankings]
  affects: [src/lib/data/gap-analysis.ts, src/app/gap-analysis/page.tsx]
tech_stack:
  added: []
  patterns: [RSC, ISR-revalidate-3600, URL-searchParams-filters, allowlist-validation]
key_files:
  created:
    - src/app/gap-analysis/page.tsx
  modified:
    - src/lib/data/gap-analysis.ts
decisions:
  - "GapRankingFilter allowlist uses 7 sgg_codes including 48128 (마산회원구) — aligns with ALLOWED_SGG_CODES in PLAN Task 1"
  - "Filter tabs implemented as Link hrefs (not form selects) — simpler, no JS required, URL-driven"
  - "ALLOWED_RISK_LEVELS as const ReadonlyArray used for type-safe includes() check"
metrics:
  duration: "18m"
  completed: "2026-05-28"
  tasks_completed: 2
  files_modified: 2
---

# Phase 20 Plan 03: Gap Analysis Ranking Page Summary

getGapRankings(filter, supabase) function + /gap-analysis RSC page with sgg_code/risk_level URL filter tabs and gap_ratio DESC table.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | getGapRankings 함수 추가 | 752fc86 | src/lib/data/gap-analysis.ts |
| 2 | /gap-analysis/page.tsx RSC 구현 | 6891f3c | src/app/gap-analysis/page.tsx |

## What Was Built

### Task 1 — getGapRankings (gap-analysis.ts)

Added to the existing `src/lib/data/gap-analysis.ts` without modifying `getComplexGapStats`:

- `GapRankingFilter` interface: `{ sggCode?: string; riskLevel?: 'safe' | 'caution' | 'danger' }`
- `GapRankingRow` interface: complexId, complexName, si, gu, sggCode, gapRatio, gapAmount, jeonseRatio, riskLevel, saleCount, jeonseCount
- `getGapRankings(filter, supabase)`: queries `complex_gap_stats JOIN complexes!inner`, orders by `gap_ratio DESC`, limits to 200 rows
- `ALLOWED_SGG_CODES` (7 values) and `ALLOWED_RISK_LEVELS` allowlists guard `.eq()` calls — SQL injection prevention per threat model T-20-10 and T-20-11

### Task 2 — /gap-analysis/page.tsx

Public RSC page (no auth required):

- `export const revalidate = 3600` — 1-hour ISR, auto-refreshes after daily cron
- `export const metadata` with title and description
- searchParams: `sgg_code` and `risk_level` — both validated against allowlists before use
- Two filter rows: 8-option region filter (전체 + 7 sgg_codes) and 4-option risk filter (전체/안전/주의/위험)
- Filters implemented as `<Link>` hrefs — no client JS, no useState, pure URL-driven navigation
- Table: `className="card"` + `overflow:hidden` + `borderCollapse:'collapse'` (admin table pattern)
- Risk badges: `#16a34a` (안전) / `#d97706` (주의) / `#dc2626` (위험) — no emoji, no gradient
- Empty state: descriptive message when rows.length === 0
- `formatPrice()`: 억/만원 unit formatting

## Deviations from Plan

None — plan executed exactly as written.

The plan template showed only RISK_OPTIONS in the filter bar example, but the plan text clearly specifies both sgg_code and risk_level filters. Both were implemented as separate filter rows. This matches the CONTEXT.md D-06 sketch.

## Verification Results

| Check | Result |
|-------|--------|
| `use client` absent | 0 occurrences |
| `revalidate = 3600` present | 1 occurrence |
| `getGapRankings` in data file | confirmed |
| `ALLOWED_SGG_CODES` in data file | 2 occurrences (definition + use) |
| Emoji absent | 0 occurrences |
| `npm run lint` | passed (0 warnings) |
| `npm run build` | passed — /gap-analysis route appears as `ƒ` (dynamic) |

## Known Stubs

None. The page queries `complex_gap_stats` via `getGapRankings`. If the table is empty (no cron has run yet), the empty state message is shown — this is intentional behavior, not a stub.

## Threat Flags

None — all security-relevant surfaces were identified in the plan's threat model and mitigated:
- T-20-10: sgg_code allowlist applied in `getGapRankings`
- T-20-11: risk_level allowlist applied in `getGapRankings` and page
- T-20-12: `.limit(200)` applied
- T-20-13: public statistics only, no PII

## Self-Check: PASSED

- `src/lib/data/gap-analysis.ts` exists and contains `getGapRankings`
- `src/app/gap-analysis/page.tsx` exists and contains `revalidate = 3600`
- Commits 752fc86 and 6891f3c exist in git log
- Build output shows `/gap-analysis` route
