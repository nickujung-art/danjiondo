# Deferred Items — Phase 33-db-1

Pre-existing issues discovered during plan execution that are out of scope for the current task
(Scope Boundary rule: only auto-fix issues directly caused by the current task's changes).

## 33-00: Pre-existing `npm run lint` errors unrelated to this plan

Discovered while running `npm run lint` as part of 33-00 Task 3 verification. None of these
files were touched by 33-00 — all are pre-existing, unrelated to regions/seed changes.

- `src/app/ads/page.tsx:2` — `'Link' is defined but never used` (`@typescript-eslint/no-unused-vars`)
- `src/app/compare/page.tsx:2` — same
- `src/app/legal/ad-policy/page.tsx:1` — same
- `src/app/legal/privacy/page.tsx:1` — same
- `src/app/legal/terms/page.tsx:1` — same

Not fixed as part of 33-00 (out of scope). Recommend a small follow-up fix/cleanup task.
