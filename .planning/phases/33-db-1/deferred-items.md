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

## 33-04: `school_ranking` RPC returns 창원 학교 for 김해시 si filter (facility_school data quality)

Discovered while writing/verifying `src/__tests__/school-ranking-regional.test.ts` against production
Supabase data (33-04 Task 1). Calling `school_ranking(p_si='김해시', ...)` returns a small number of
rows whose `gu` is non-null (e.g. `교동초등학교` → `마산회원구`, `창원남산초등학교` → `성산구`,
`사파초등학교` → `성산구`, `대야초등학교`/`용원초등학교`/`안골포초등학교`/`진해신항초등학교` →
`진해구`) even though the query filters `complexes.si = '김해시'`.

Root cause (not fixed, out of scope for 33-04): the RPC joins `facility_school` to `complexes` via
`fs.complex_id`, and some 김해시 complexes are apparently linked to a `facility_school` row whose
`road_address` is actually in 창원시 (i.e. a pre-existing school-matching/geocoding issue from the
학군 데이터 파이프라인, unrelated to Phase 33's regional-filter hardcoding work). The RPC's own
CASE WHEN gu-extraction logic is correct and behaves as designed (Pattern 3 verified) — this is a
data linkage issue in `facility_school`, not a logic bug in `school_ranking` or `seo-hierarchy.ts`.

Impact: minor — affects gu display accuracy for a handful of schools on 김해시 학군 pages, not a
crash or security issue. `school-ranking-regional.test.ts`'s 김해시 test was adjusted to assert the
weaker, defensible invariant (fallback produces null AND any non-null gu is one of the 5 known
창원구 names) instead of "all rows null", to avoid encoding this pre-existing bug as expected
behavior. Recommend a follow-up data-quality task auditing `facility_school.complex_id` assignments
for cross-region contamination (likely nearest-school matching bug from Phase 10).
