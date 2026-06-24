# Phase 30: Card News — Pattern Map

**Mapped:** 2026-06-24
**Files analyzed:** 5 card-news scripts + 3 main bds source files
**Analogs found:** 5 / 5

---

## File Classification

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `card-news/scripts/fetch-data.js` | service | CRUD / batch aggregation | `src/lib/data/rankings.ts` | exact |
| `card-news/scripts/templates.js` | utility | transform (data → HTML string) | `src/app/api/cardnews/generate/CardnewsLayout.tsx` | role-match |
| `card-news/scripts/capture.js` | utility | file-I/O (HTML → PNG) | no analog | none |
| `card-news/scripts/generate.js` | orchestrator / CLI | batch | `src/app/api/cron/daily/route.ts` | role-match |
| `card-news/scripts/setup.js` | utility | file-I/O (HTTP download) | no analog | none |

---

## Pattern Assignments

### `fetch-data.js` — Supabase aggregation service

**Analog:** `src/lib/data/rankings.ts`

**Supabase client pattern** — card-news uses bare `createClient` with service_role key (correct for CLI):

```js
// card-news/scripts/fetch-data.js lines 4-11
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)
```

The main bds uses `@supabase/ssr` with cookies — that pattern is NOT applicable here. The CLI pattern above is correct.

**Transaction filter pattern** — rankings.ts lines 82-88 (gold standard):

```ts
// src/lib/data/rankings.ts lines 82-88
.is('cancel_date', null)
.is('superseded_by', null)
.eq('deal_type', 'sale')
.gte('deal_date', thirtyDaysAgo)
.in('sgg_code', ACTIVE_SGG_CODES)
.not('complex_id', 'is', null)
```

card-news correctly replicates all five filters. ✓

**Aggregation pattern (max-price-per-complex)** — rankings.ts lines 94-105:

```ts
// src/lib/data/rankings.ts lines 94-101
const map = new Map<string, { price: number; area_m2: number | null }>()
for (const row of data ?? []) {
  const cid: string = r.complex_id
  const price: number = r.price
  const cur = map.get(cid)
  if (!cur || price > cur.price) map.set(cid, { price, area_m2: r.area_m2 ?? null })
}
```

card-news fetch-data.js uses identical structure. ✓

**Price-per-pyeong calculation** — rankings.ts line 168:

```ts
const pricePerPyeong = (r.price as number) / ((r.area_m2 as number) / 3.3058)
```

card-news fetch-data.js line 219:
```js
const ppp = t.price / (t.area_m2 / 3.3058)
```

Identical divisor. ✓

---

### `generate.js` — orchestrator / CLI entry point

**Analog:** `src/app/api/cron/daily/route.ts` (same sequential aggregation pattern)

**SGG code definition** — rankings.ts lines 7, rankings-page.ts lines 6-16 (authoritative):

```ts
// src/lib/data/rankings.ts line 7
const ACTIVE_SGG_CODES = ['48121', '48123', '48125', '48127', '48129', '48250'] as const

// src/lib/data/rankings-page.ts lines 9-13 (CHAMPION_REGIONS — use for district label mapping)
export const CHAMPION_REGIONS = [
  { sggCode: '48121', label: '의창구' },
  { sggCode: '48123', label: '성산구' },
  { sggCode: '48125', label: '마산합포구' },
  { sggCode: '48127', label: '마산회원구' },
  { sggCode: '48129', label: '진해구' },
  { sggCode: '48250', label: '김해시' },
]
```

---

## CRITICAL BUGS

These must be fixed before the scripts produce correct output.

### BUG 1: 성산구/의창구 SGG Code Swap (CRITICAL)

**Location:** `card-news/scripts/generate.js` lines 33-40 (SGG_MAP) and lines 48-65 (AREA_GU_SERIES)

**Current (WRONG):**
```js
const SGG_MAP = {
  '48121': '성산구',   // WRONG — 48121 is 의창구
  '48123': '의창구',   // WRONG — 48123 is 성산구
  ...
}
```

**Correct mapping (from `src/lib/data/rankings-page.ts`):**
```js
const SGG_MAP = {
  '48121': '의창구',   // correct
  '48123': '성산구',   // correct
  '48125': '마산합포구',
  '48127': '마산회원구',
  '48129': '진해구',
  '48250': '김해시',
}
```

**Impact:** When generate.js runs `84-seongsan` (성산구 card), it queries `sggCode: '48121'` which is 의창구 data. The card is labeled "창원 성산구" but shows 의창구 rankings. Same error for `84-uichang`, `59-seongsan`, `59-uichang`, `102-seongsan`, `102-uichang`.

**Fix required in AREA_GU_SERIES** (swap the sggCode values for seongsan and uichang entries):
```js
{ id: '84-seongsan', region: '창원 성산구', ..., sggCode: '48123' },  // was 48121
{ id: '84-uichang',  region: '창원 의창구', ..., sggCode: '48121' },  // was 48123
{ id: '59-seongsan', region: '창원 성산구', ..., sggCode: '48123' },
{ id: '59-uichang',  region: '창원 의창구', ..., sggCode: '48121' },
{ id: '102-seongsan', region: '창원 성산구', ..., sggCode: '48123' },
{ id: '102-uichang',  region: '창원 의창구', ..., sggCode: '48121' },
```

---

### BUG 2: Missing `.limit()` on All Transaction Queries (HIGH RISK)

**Location:** `card-news/scripts/fetch-data.js` — every `supabase.from('transactions')` call

**Problem:** Supabase PostgREST applies a server-side row cap when no `.limit()` is specified (the project-level `db.max_rows` setting, often 1000). If a week has more than 1000 transactions matching the filter, the query silently returns an incomplete result set, distorting rankings without any error.

**Pattern from main bds** (`src/lib/data/rankings.ts` lines 89, 128, 158):
```ts
.limit(2000)  // aggregateHighPrice
.limit(5000)  // aggregateVolume
.limit(5000)  // aggregatePricePerPyeong
```

**Required fix:** Add `.limit(5000)` to each transaction query in fetch-data.js:
- `fetchAreaRanking` (line 79)
- `fetchCityRanking` (line 119)
- `fetchVolumeRanking` (line 163)
- `fetchValueRanking` (line 201)
- `fetchDistrictChampions` (line 253)

---

## Consistency Issues (Non-Critical)

### formatPrice — Missing Guard Clause

**card-news/scripts/fetch-data.js lines 52-58:**
```js
export function formatPrice(manwon) {
  const eok = Math.floor(manwon / 10000)
  const rem = manwon % 10000
  if (eok === 0) return `${manwon.toLocaleString('ko-KR')}만`
  if (rem === 0) return `${eok}억`
  return `${eok}억 ${rem.toLocaleString('ko-KR')}`
}
```

**src/lib/format.ts lines 4-11 (main bds version):**
```ts
export function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price < 0) return '—'
  const uk = Math.floor(price / 10000)
  const man = price % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}`
  if (uk > 0) return `${uk}억`
  return `${price.toLocaleString()}만`
}
```

**Differences:**
1. Main version guards against `NaN`/`Infinity`/negative — card-news has no guard. If a `price` field returns `null` and JS arithmetic produces `NaN`, `Math.floor(NaN)` = `NaN`, causing `"NaN억 NaN만"` on the card.
2. Main uses `.toLocaleString()` (implicit system locale); card-news uses `.toLocaleString('ko-KR')` (explicit). Explicit is safer in CI/CD (GitHub Actions ubuntu runner may have non-KR locale).

**Recommendation:** Add the `!Number.isFinite(manwon) || manwon < 0` guard. The `.toLocaleString('ko-KR')` in card-news is actually safer than the main app's implicit locale for the CI context.

---

### DRY Violation: `pad10` Duplicated

The `pad10` helper is defined identically in two files:
- `card-news/scripts/templates.js` lines 63-65
- `card-news/scripts/generate.js` lines 76-78

Both contain:
```js
function pad10(ranking) {
  return Array.from({ length: 10 }, (_, i) => ranking[i] ?? { rank: i + 1, name: null, price: null, subtitle: null })
}
```

Since templates.js already exports render functions that call `pad10` internally, and generate.js also calls `pad10` before passing to `generateCardSet`, the generate.js copy is the only one that needs to exist. The templates.js `pad10` is never called from outside templates.js, so it is locally scoped. This is low-priority but confusing — one canonical location would be cleaner.

---

### Dead Code: `--week-offset` Option

`generate.js` line 7 documents `--week-offset=-1` as a supported CLI flag, but the main() function (lines 108-115) never parses this argument:

```js
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const filterArg = args.find((a) => a.startsWith('--series='))
// --week-offset is never read
```

`getLastWeekRange()` is also called without parameters and hardcodes "last week" with no offset support. Either remove the documentation or implement the offset.

---

### CI Failure: Missing `package-lock.json`

`.github/workflows/weekly-generate.yml` line 32 uses:
```yaml
cache-dependency-path: card-news/package-lock.json
```
and line 35 uses `npm ci`, which requires a lock file. The `card-news/` directory only has `package.json`, no `package-lock.json`. The workflow will fail at the `npm ci` step until the lock file is committed.

**Fix:** Run `npm install` inside `card-news/` locally and commit the generated `package-lock.json`.

---

## Shared Patterns (Cross-Cutting)

### Transaction Filter (applies to all fetch-*.js queries)

**Source:** `src/lib/data/rankings.ts` lines 82-90 and CLAUDE.md canonical rule
```
cancel_date IS NULL AND superseded_by IS NULL AND deal_type='sale'
```
All five fetch functions in fetch-data.js apply this correctly. ✓

### SGG Code Set (authoritative)

**Source:** `src/lib/data/rankings.ts` line 7
```js
['48121', '48123', '48125', '48127', '48129', '48250']
```
card-news generate.js line 32 uses identical set. ✓

### District Label Mapping (authoritative)

**Source:** `src/lib/data/rankings-page.ts` CHAMPION_REGIONS
```
48121 = 의창구  |  48123 = 성산구  |  48125 = 마산합포구
48127 = 마산회원구  |  48129 = 진해구  |  48250 = 김해시
```
card-news SGG_MAP has 48121/48123 **swapped** — see BUG 1 above.

---

## No Analog Found

| File | Reason |
|------|--------|
| `card-news/scripts/capture.js` | No Puppeteer screenshot utility exists in main bds codebase |
| `card-news/scripts/setup.js` | No font-download script exists in main bds codebase |

For capture.js, the Puppeteer singleton pattern (`let _browser = null; getBrowser()`) is a standard Node.js module singleton — no codebase analog needed.

---

## Metadata

**Files scanned:** 8 (5 card-news scripts + rankings.ts + rankings-page.ts + format.ts)
**Pattern extraction date:** 2026-06-24
**Analog search scope:** `src/lib/data/`, `src/lib/format.ts`
