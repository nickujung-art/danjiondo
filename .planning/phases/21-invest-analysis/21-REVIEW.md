---
phase: 21-invest-analysis
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - next.config.ts
  - src/app/complexes/[id]/page.tsx
  - src/app/invest/page.tsx
  - src/components/invest/ComplexPriceChart.tsx
  - src/components/invest/ComplexPriceChartWrapper.tsx
  - src/components/invest/RegionalPriceChart.tsx
  - src/components/invest/RegionalPriceChartWrapper.tsx
  - src/lib/data/invest.ts
  - supabase/migrations/20260529000001_invest_price_history.sql
findings:
  critical: 0
  high: 0
  medium: 4
  low: 2
  total: 9
status: clean
---

# Code Review — Phase 21: invest-analysis

**Reviewed:** 2026-05-29
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 21 adds the `/invest` page (regional price chart + gap-investment ranking), price history RPCs in Supabase, and a price chart section embedded in the complex detail page. The input validation allowlists (`ALLOWED_SGG_CODES`, `ALLOWED_AREA_BUCKETS`, `ALLOWED_RISK_LEVELS`) are correctly applied before DB calls. The critical CLAUDE.md constraints — `cancel_date IS NULL AND superseded_by IS NULL` on transaction queries — are honored in both SQL functions and the TypeScript `getComplexAreaTypes` direct query.

One CRITICAL defect was found: the `p_months` parameter is used in a raw string concatenation inside both SQL functions, constructing an interval expression without a guard on the integer's range. A caller passing a pathological value (e.g. a very large negative number) can shift the date window arbitrarily. Two HIGH issues involve sequential DB calls where parallel is required, and a missing allowlist guard on the `p_deal_type` RPC parameter. Medium issues cover `as any` type suppressions, a duplicate component, and an in-render constant. Low issues are minor code style problems.

---

## Findings

### [CRITICAL] SQL interval constructed via integer string concatenation — no bounds check on `p_months`

**File:** `supabase/migrations/20260529000001_invest_price_history.sql`
**Line:** 27, 66

**Issue:** Both `invest_price_history` and `invest_regional_price_history` build the date cutoff using:
```sql
AND deal_date >= (CURRENT_DATE - (p_months || ' months')::interval)::date
```
`p_months` is declared `INT`, so PostgreSQL will reject non-integer input. However there is no `CHECK` constraint or `GREATEST` guard on the value. A caller passing `p_months = -1200` (100 years in the future) would return zero rows silently. A caller passing `p_months = 1200` returns a 100-year window, potentially dumping the entire `transactions` table into the aggregation — a major denial-of-service / data-exposure path if the RPC is ever called from untrusted input.

Currently `p_months` is always passed as the literal `24` from TypeScript, so this is not exploitable today. But the SQL function is granted to `anon` (line 43, 83), meaning any anonymous client that can call RPCs could pass arbitrary values.

**Fix:** Add a range guard at the top of each function body, or use a `BETWEEN` constraint:
```sql
-- Clamp months to a safe range (1–60) before use
p_months := GREATEST(1, LEAST(60, p_months));
```
Or add a `CHECK` at the parameter level using a domain type. Also consider restricting the GRANT to `authenticated` only if unauthenticated price history access is not required.

---

### [HIGH] `getComplexAreaTypes` makes 4 sequential Supabase round-trips inside a `for` loop

**File:** `src/lib/data/invest.ts`
**Line:** 67–101

**Issue:** The function loops over the 4 area buckets and issues `await q` sequentially inside the loop body (line 97). Each iteration waits for the previous to complete. Since these 4 queries are independent, this adds ~3× unnecessary latency to the complex detail page load, which already runs a 17-item `Promise.all`. On a cold ISR render this stacks serial network round-trips onto the critical path.

**Fix:** Run all 4 count queries in parallel and collect results:
```typescript
const counts = await Promise.all(
  buckets.map(async (bucket) => {
    // build q for this bucket ...
    const { count } = await q
    return { bucket, count: count ?? 0 }
  })
)
const result: AreaType[] = counts
  .filter(({ count }) => count >= 3)
  .map(({ bucket, count }) => ({ bucket, txCount: count }))
return result
```

---

### [HIGH] `p_deal_type` is an unvalidated `text` parameter exposed to `anon` callers

**File:** `supabase/migrations/20260529000001_invest_price_history.sql`
**Line:** 12, 26

**Issue:** `invest_price_history` accepts `p_deal_type text DEFAULT 'sale'` and uses it directly in:
```sql
AND deal_type = p_deal_type::public.deal_type
```
The `::public.deal_type` cast will raise an error at runtime if an invalid string is passed (e.g. `'jeonse'`, `'unknown'`, or an empty string `''`). This causes a 500-class error for the calling application rather than a graceful empty result.

The function is GRANTED to `anon`, so any anonymous user can call it with `p_deal_type = ''` and receive a DB error. While it doesn't expose data, it creates an unhandled error path that bypasses the TypeScript `.catch(() => [])` in some Supabase client configurations (the error bubbles as an RPC error object, not a thrown exception — see the `if (error || !data) return []` guard in `invest.ts:43`). The guard does handle it, but the DB still processes an invalid cast each time.

Since the TypeScript caller always passes `'sale'` (hardcoded at line 119), this cannot be exploited today through the application. However the function is callable directly by any `anon` client.

**Fix:** Either restrict the parameter to the enum type directly, or add a guard:
```sql
p_deal_type  public.deal_type  DEFAULT 'sale'
```
This change makes the parameter type-safe at the DB boundary and eliminates the invalid-cast error path.

---

### [MEDIUM] `supabase as any` casts on RPC calls suppress type safety for both RPC functions

**File:** `src/lib/data/invest.ts`
**Line:** 38, 117

**Issue:** Both `getRegionalPriceHistory` and `getComplexPriceByType` cast `supabase` to `any` before calling `.rpc()`. This is required because the generated `Database` type does not include the new RPCs (`invest_regional_price_history`, `invest_price_history`). As a result, TypeScript cannot verify parameter names, parameter types, or the return shape. If the SQL function signatures change, these callers will silently break at runtime.

**Fix:** Regenerate the Supabase type definitions to include the new RPC functions (`npx supabase gen types typescript --local > src/types/database.ts`), then remove the `as any` cast. Until then, at minimum add a cast to the known return type rather than relying on `any`:
```typescript
const { data, error } = await (supabase as SupabaseClient).rpc(
  'invest_price_history' as never, // temporary
  { p_complex_id: complexId, p_deal_type: 'sale', p_months: months, p_area_bucket: areaBucket ?? null }
)
```
The generated types should be regenerated as part of the phase completion checklist.

---

### [MEDIUM] `ComplexPriceChart` and `RegionalPriceChart` are near-identical — shared component not extracted

**File:** `src/components/invest/ComplexPriceChart.tsx`, `src/components/invest/RegionalPriceChart.tsx`

**Issue:** Both files are character-for-character identical except for the SVG gradient ID prefix (`complexPriceGrad-` vs `priceGrad-`). Both use the same `RegionalPricePoint` type, identical logic, and identical JSX. This is a DRY violation — two components to maintain, two places where bugs must be fixed, two files to update when the chart design changes.

**Fix:** Extract a single shared `PriceAreaChart` component parameterized by `gradIdPrefix`:
```typescript
// src/components/invest/PriceAreaChart.tsx
interface PriceAreaChartProps {
  data:        RegionalPricePoint[]
  title:       string
  gradIdPrefix?: string   // defaults to 'priceGrad'
}
```
Remove `ComplexPriceChart.tsx` and `RegionalPriceChart.tsx`; update both wrappers to import `PriceAreaChart`.

---

### [MEDIUM] SVG gradient `id` derived from user-supplied `title` prop — special characters not sanitized

**File:** `src/components/invest/ComplexPriceChart.tsx:45`, `src/components/invest/RegionalPriceChart.tsx:45`

**Issue:** The gradient element ID is constructed as:
```typescript
const gradId = `complexPriceGrad-${title.replace(/\s/g, '')}`
```
The `title` prop is passed from the server component with strings like `"최근 24개월 매매 실거래 월평균 (59㎡)"`. The regex only strips whitespace. SVG element IDs must match CSS `<ident>` rules — characters like `(`, `)`, `%`, Korean glyphs, and digits at the start are technically invalid as bare CSS identifiers (though browsers accept them in the SVG `id` attribute). More importantly, the `fill={`url(#${gradId})`}` reference in the `Area` component is injected directly into an SVG attribute: if `title` were ever sourced from user input (e.g. a complex name) this could result in a malformed `url(#...)` reference that breaks the chart silently.

Currently the title is constructed entirely from server-side constants so XSS is not a concern. But the ID construction is fragile.

**Fix:** Use a stable, sanitized ID:
```typescript
const gradId = `priceGrad-${useId ? useId() : Math.random().toString(36).slice(2)}`
```
Or in a non-hook context, pass a stable `id` prop from the wrapper rather than deriving it from `title`.

---

### [MEDIUM] `AREA_LABEL` constant defined inside the JSX render map

**File:** `src/app/complexes/[id]/page.tsx`
**Line:** 736

**Issue:**
```tsx
{areaTypes.map(t => {
  const AREA_LABEL: Record<string, string> = { '소형': '소형', '59': '59㎡', '84': '84㎡', '대형': '대형' }
  ...
})}
```
The `AREA_LABEL` object is recreated on every iteration of the map. This is a Server Component so there is no re-render penalty, but it is poor style that conflicts with the coding-style.md guidance against magic values and recommends constants. The object should also be `as const` since it is a static lookup.

**Fix:** Move the constant to module scope (or at least outside the `.map()` call):
```typescript
const AREA_LABEL: Record<string, string> = {
  '소형': '소형',
  '59':   '59㎡',
  '84':   '84㎡',
  '대형': '대형',
} as const
```

---

### [LOW] `data[data.length - 1]` access pattern inconsistent with `noUncheckedIndexedAccess`

**File:** `src/components/invest/ComplexPriceChart.tsx:42`, `src/components/invest/RegionalPriceChart.tsx:42`

**Issue:** With `noUncheckedIndexedAccess: true` in `tsconfig.json`, `data[data.length - 1]` has type `RegionalPricePoint | undefined`. The optional chaining `?.avgPrice` correctly handles the undefined case. However the guard at line 26 (`if (data.length < 2) return ...`) means that by line 42 `data.length >= 2` is guaranteed, so the `?.` is defensive but redundant. The idiomatic approach under `noUncheckedIndexedAccess` is to use `.at(-1)` (which returns `T | undefined` by design) or to avoid the index pattern entirely:

```typescript
const last = data.at(-1)?.avgPrice ?? 0
```

This is already used correctly on line 311 of `complexes/[id]/page.tsx` (`saleData.at(-1)`), making the inconsistency a minor style issue. Not a bug, but inconsistent with project patterns.

**Fix:** Replace `data[data.length - 1]?.avgPrice` with `data.at(-1)?.avgPrice` in both chart components.

---

### [LOW] `next.config.ts` CSP uses `'unsafe-inline'` for `script-src`

**File:** `next.config.ts`
**Line:** 36

**Issue:**
```
"script-src 'self' 'unsafe-inline' *.kakao.com *.daumcdn.net",
```
`'unsafe-inline'` for `script-src` effectively disables script injection protection for all inline scripts. This was pre-existing before Phase 21 but the phase touched this file (adding the `/gap-analysis` → `/invest` redirect). Flagged here as it is now in the review scope.

The `web/security.md` rule explicitly requires nonce-based CSP instead of `'unsafe-inline'` for scripts.

**Fix:** Replace `'unsafe-inline'` with a per-request nonce. In Next.js 15 App Router this requires a middleware-generated nonce passed via `headers()`:
```
"script-src 'self' 'nonce-{RANDOM}' *.kakao.com *.daumcdn.net",
```
If nonce implementation is deferred, document the exception. This is a LOW finding only because `'unsafe-inline'` was already present before this phase.

---

## Verdict

**APPROVED WITH WARNINGS**

The CRITICAL finding (unbounded `p_months` RPC parameter exposed to `anon`) must be addressed before the next production deployment. The two HIGH findings (sequential DB queries and untyped `p_deal_type`) should be fixed in the current phase. The MEDIUM findings (duplicate chart components, `as any` casts, in-render constant) are maintainability issues that should be addressed as part of cleanup. The LOW findings are non-blocking.

_Reviewed: 2026-05-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
