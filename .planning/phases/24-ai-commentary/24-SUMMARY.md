---
phase: 24
plan: ai-commentary
subsystem: invest-ranking
tags: [ai, batch, gemini, commentary, invest]
dependency_graph:
  requires: [complex_price_predictions, complexes, complex_gap_stats, facility_kapt, facility_school]
  provides: [ai_commentary on complex_price_predictions]
  affects: [invest-ranking-ui]
tech_stack:
  added: [gemini-2.0-flash batch script, GitHub Actions monthly cron]
  patterns: [concurrency-5 batch, LATERAL JOIN, isMain guard for script import safety]
key_files:
  created:
    - supabase/migrations/20260612000001_complex_commentary_inputs_rpc.sql
    - scripts/generate-complex-commentary.ts
    - .github/workflows/monthly-ai-commentary.yml
    - src/lib/ai/__tests__/complex-commentary.test.ts
  modified:
    - src/components/invest/PredictionSection.tsx
decisions:
  - get_complex_commentary_batch_inputs uses the same near/far price aggregation pattern as invest_prediction_ranking (3-day freshness window)
  - price_change_30d returned as % (×100 in SQL) so script receives display-ready values
  - buildComplexPrompt exported at module level with isMain guard so tests can import without side effects
  - gap_amount cast int (bigint→int), built_year/hagwon_score cast int (smallint→int) in RPC RETURNS TABLE
metrics:
  duration: ~12 minutes
  completed: "2026-06-11"
  tasks_completed: 5
  files_changed: 5
---

# Phase 24 Plan ai-commentary Summary

Gemini 2.0 Flash batch that fills `complex_price_predictions.ai_commentary` monthly, renders commentary in the invest ranking table.

## Tasks Completed

| Task | Commit | Description |
|------|--------|-------------|
| 24-01 | 58d71a9 | SQL RPC `get_complex_commentary_batch_inputs` — joins predictions + complexes + gap_stats + facility_kapt + facility_school |
| 24-02 | 1ffb7f8 | `scripts/generate-complex-commentary.ts` — CLI batch with concurrency-5, dry-run, verbose flags |
| 24-03 | d213039 | `PredictionSection.tsx` — adds `aiCommentary` line-clamp-2 under complex name when present |
| 24-04 | 3d7b515 | `.github/workflows/monthly-ai-commentary.yml` — monthly cron (매월 1일 05:00 KST) + workflow_dispatch |
| 24-05 | 658ade9 | 7 Vitest tests for `buildComplexPrompt`: null handling, risk mapping, age calc, sign prefix, sections |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

`ai_commentary` column is NULL until the batch script is run for the first time. The UI conditionally renders (`{item.aiCommentary && ...}`) so no stubs appear in the ranking card until data is populated. Run:

```bash
npx tsx --env-file=.env.local scripts/generate-complex-commentary.ts --dry-run
npx tsx --env-file=.env.local scripts/generate-complex-commentary.ts --limit=50
```

## Threat Flags

None — no new network endpoints or auth paths introduced. The batch script uses existing service_role key pattern consistent with other scripts.

## Self-Check: PASSED

- `supabase/migrations/20260612000001_complex_commentary_inputs_rpc.sql` — exists
- `scripts/generate-complex-commentary.ts` — exists
- `src/components/invest/PredictionSection.tsx` — modified
- `.github/workflows/monthly-ai-commentary.yml` — exists
- `src/lib/ai/__tests__/complex-commentary.test.ts` — exists, 7/7 tests pass
- All 5 commits verified in git log
