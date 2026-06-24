# Phase 30 — Bug Fixes & Environment Setup PLAN

**Wave:** 0
**Goal:** Fix all blocking bugs so the pipeline produces correct data and can run in CI without crashing.
**Estimated time:** 30–45 min
**Commit strategy:** One commit per task (6 commits)

## Pre-conditions

- `card-news/` directory exists with all 5 scripts already written
- Supabase project is live (used by main bds app)
- Node.js 20+ installed locally
- Working directory for all `node` commands: `C:\Users\jung\coding\bds\card-news`

---

## Task 0.1: Fix SGG Code Swap (BUG-1 — CRITICAL)

**File(s):** `card-news/scripts/generate.js`

**Action:** EDIT

**Spec:**

Two separate fixes in the same file.

**Fix A — SGG_MAP (lines 33–40):**

Replace the current (wrong) mapping:
```js
const SGG_MAP = {
  '48121': '성산구',
  '48123': '의창구',
```

With the correct mapping (authoritative source: `src/lib/data/rankings-page.ts` CHAMPION_REGIONS):
```js
const SGG_MAP = {
  '48121': '의창구',
  '48123': '성산구',
```

**Fix B — AREA_GU_SERIES sggCode values (lines 48–65):**

Swap the `sggCode` for all seongsan and uichang entries. 성산구 = 48123, 의창구 = 48121.

Change these 6 entries:
```js
// BEFORE (wrong)
{ id: '84-seongsan',  ..., sggCode: '48121' },
{ id: '84-uichang',   ..., sggCode: '48123' },
{ id: '59-seongsan',  ..., sggCode: '48121' },
{ id: '59-uichang',   ..., sggCode: '48123' },
{ id: '102-seongsan', ..., sggCode: '48121' },
{ id: '102-uichang',  ..., sggCode: '48123' },

// AFTER (correct)
{ id: '84-seongsan',  ..., sggCode: '48123' },
{ id: '84-uichang',   ..., sggCode: '48121' },
{ id: '59-seongsan',  ..., sggCode: '48123' },
{ id: '59-uichang',   ..., sggCode: '48121' },
{ id: '102-seongsan', ..., sggCode: '48123' },
{ id: '102-uichang',  ..., sggCode: '48121' },
```

The `region` labels (e.g. '창원 성산구') remain unchanged — only the `sggCode` values are swapped.

**Verify:** After edit, `grep "48121" card-news/scripts/generate.js` should show only uichang entries; `grep "48123"` should show only seongsan entries.

**Commit:** `fix(card-news): correct 성산구/의창구 SGG code swap in generate.js`

---

## Task 0.2: Add `.limit(5000)` + `formatPrice` Guard (BUG-2)

**File(s):** `card-news/scripts/fetch-data.js`

**Action:** EDIT

**Spec:**

**Fix A — Add `.limit(5000)` to all 5 fetch functions.**

PostgREST's default row cap is 1000. Without a limit, a high-volume week silently returns incomplete data and distorts rankings.

Add `.limit(5000)` as the last chain call before `.not('complex_id', 'is', null)` in each function:

1. `fetchAreaRanking` — add after `.lte('area_m2', areaMax)` (around line 89)
2. `fetchCityRanking` — add after `.in('sgg_code', sggCodes)` (around line 128)
3. `fetchVolumeRanking` — add after `.in('sgg_code', sggCodes)` (around line 170)
4. `fetchValueRanking` — add after `.gt('area_m2', 0)` (around line 213)
5. `fetchDistrictChampions` — add after `.in('sgg_code', allCodes)` (around line 258)

In each case the `.limit(5000)` goes before `.not('complex_id', 'is', null)` to be consistent with the main app's pattern.

**Fix B — Add NaN guard to `formatPrice` (lines 52–58).**

The current function will produce `"NaN억 NaN만"` if called with a null price. Add guard at the top:

```js
export function formatPrice(manwon) {
  if (!Number.isFinite(manwon) || manwon < 0) return '—'
  const eok = Math.floor(manwon / 10000)
  // ... rest unchanged
```

**Verify:** Count `.limit(` occurrences in the file — expect 5:
```
node -e "const fs=require('fs');const c=fs.readFileSync('scripts/fetch-data.js','utf-8').split('.limit(').length-1;console.log('limit count:',c)"
```
Expected: `limit count: 5`

**Commit:** `fix(card-news): add .limit(5000) to all queries + formatPrice NaN guard`

---

## Task 0.3: Fix Windows Font Path + Capture Path (BUG-4)

**File(s):** `card-news/scripts/templates.js`, `card-news/scripts/capture.js`

**Action:** EDIT

**Spec:**

**Fix A — templates.js: Use `pathToFileURL` for `@font-face` src and logo path.**

`path.resolve()` on Windows returns backslash paths (e.g. `C:\Users\...`) which are invalid CSS `url()` values. Replace with a proper `file:///` URL.

At the top of `templates.js`, add the import:
```js
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'  // add pathToFileURL
```

Replace:
```js
const ROOT = resolve(__dirname, '..')
```
With:
```js
const ROOT_URL = pathToFileURL(resolve(__dirname, '..')).href
```

In `BASE_CSS`, replace all `${ROOT}/fonts/` with `${ROOT_URL}/fonts/`:
```css
@font-face { font-family: 'Pretendard'; font-weight: 900; src: url('${ROOT_URL}/fonts/Pretendard-Black.woff2') ...
@font-face { font-family: 'Pretendard'; font-weight: 800; src: url('${ROOT_URL}/fonts/Pretendard-ExtraBold.woff2') ...
@font-face { font-family: 'Pretendard'; font-weight: 700; src: url('${ROOT_URL}/fonts/Pretendard-Bold.woff2') ...
@font-face { font-family: 'Pretendard'; font-weight: 600; src: url('${ROOT_URL}/fonts/Pretendard-SemiBold.woff2') ...
@font-face { font-family: 'Pretendard'; font-weight: 500; src: url('${ROOT_URL}/fonts/Pretendard-Medium.woff2') ...
```

Replace:
```js
const LOGO_PATH = `${ROOT}/assets/logo.png`
```
With:
```js
const LOGO_PATH = `${ROOT_URL}/assets/logo.png`
```

**Fix B — capture.js: Three improvements.**

1. Add `pathToFileURL` import at top:
```js
import { pathToFileURL } from 'url'
```

2. Add `--font-render-hinting=none` to launch args (improves CJK kerning consistency across Chromium versions):
```js
args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
```

3. Fix `page.goto` to use a proper `file://` URL and switch `waitUntil` from `networkidle0` to `load` (`networkidle0` adds ~2s overhead for local file:// pages per Puppeteer issue #11529; `load` is equivalent for local HTML with no external resources):
```js
await page.goto(pathToFileURL(tempPath).href, { waitUntil: 'load', timeout: 15000 })
```

**Verify:** On Windows, run:
```
node -e "import('./scripts/templates.js').then(m => { const h = m.renderClosing({source:'test'}); console.log(h.includes('file:///') ? 'OK: file:/// found' : 'FAIL: no file:///') })"
```
Expected: `OK: file:/// found`

**Commit:** `fix(card-news): pathToFileURL for font/asset paths + capture.js improvements`

---

## Task 0.4: Fix GitHub Actions Chromium Dependencies (BUG-3)

**File(s):** `card-news/.github/workflows/weekly-generate.yml`

**Action:** EDIT

**Spec:**

Puppeteer 23.x bundles Chrome for Testing (downloaded via `npm ci`), but the bundled binary links against system libraries not pre-installed on ubuntu-24.04. `libgbm1` is the most commonly missing package and causes silent Chromium launch failures.

Add a new step **before** the `Install dependencies` step:

```yaml
steps:
  - uses: actions/checkout@v4

  - uses: actions/setup-node@v4
    with:
      node-version: '20'
      cache: 'npm'
      cache-dependency-path: card-news/package-lock.json

  - name: Install Chromium system dependencies
    run: |
      sudo apt-get update -q
      sudo apt-get install -y libgbm1 libasound2t64 libatk1.0-0 libatk-bridge2.0-0 \
        libxss1 libgtk-3-0 libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgdk-pixbuf2.0-0

  - name: Install dependencies
    run: npm ci
  # ... rest unchanged
```

Note: `libasound2t64` is the Ubuntu 24.04 renamed package (was `libasound2` in 22.04). The old name will fail on ubuntu-latest.

Also add `actions/cache@v4` for fonts **after** the `Install dependencies` step and **before** `Download Pretendard fonts`:

```yaml
  - name: Cache Pretendard fonts
    uses: actions/cache@v4
    with:
      path: card-news/fonts
      key: pretendard-1.3.9

  - name: Download Pretendard fonts
    run: node scripts/setup.js
```

The cache key `pretendard-1.3.9` never expires (pinned version). `setup.js` already has `existsSync` skip-if-exists logic so a cache hit means setup.js does nothing.

**Verify:** `cat card-news/.github/workflows/weekly-generate.yml | grep "libgbm1"` returns one match.

**Commit:** `fix(card-news): add Chromium system deps + font cache to GitHub Actions`

---

## Task 0.5: Generate and Commit `package-lock.json`

**File(s):** `card-news/package-lock.json` (new)

**Action:** RUN + COMMIT

**Spec:**

The workflow uses `npm ci` which requires `package-lock.json`. Without it, CI fails at the `Install dependencies` step.

```bash
cd C:/Users/jung/coding/bds/card-news
npm install
```

This generates `package-lock.json` (and downloads `node_modules/`). Verify it was created:
```bash
ls card-news/package-lock.json
```

Stage only the lock file (not node_modules — it should already be in .gitignore):
```bash
git add card-news/package-lock.json
git commit -m "chore(card-news): add package-lock.json for npm ci"
```

**Verify:** `cat card-news/.gitignore | grep node_modules` should show `node_modules` is ignored. If `.gitignore` doesn't exist in card-news/, create one with content:
```
node_modules/
fonts/
output/
.env
```

**Commit:** `chore(card-news): add package-lock.json for npm ci`

---

## Task 0.6: Verify `.env` File

**File(s):** `card-news/.env` (verify/create)

**Action:** VERIFY

**Spec:**

The scripts require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `card-news/.env`.

Check if it exists:
```bash
ls card-news/.env
```

If missing, create `card-news/.env` with the same values as the main bds project (check `.env.local` in the bds root for `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`):

```
SUPABASE_URL=https://[your-project-id].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Confirm the file loads correctly (dry run prints no error):
```bash
cd card-news && node -e "import('dotenv/config').then(() => console.log('URL:', process.env.SUPABASE_URL ? 'set' : 'MISSING', '| KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING'))"
```

Expected output: `URL: set | KEY: set`

Do NOT commit `.env` — it must be in `.gitignore`.

**Commit:** none (`.env` is not committed)

---

## Task 0.7: Fix `area=null` in renderCover (WARN-2)

**File(s):** `card-news/scripts/templates.js`

**Action:** EDIT

**Spec:**

In `renderCover()`, the title block renders:
```js
<span class="title-blue">${area}</span> 실거래가
```

When `area` is `null` (city-overall, city-volume, district-champions), this renders the literal string `"null 실거래가"` in the cover card.

Find the renderCover function and replace the area title line. The exact pattern to find (it may span 2-3 lines in BASE_HTML_COVER or a similar template string):

```js
<span class="title-blue">${area}</span> 실거래가
```

Replace with:
```js
${area ? `<span class="title-blue">${area}</span> 실거래가` : '전체 실거래가'}
```

**Verify:** Confirm no literal "null" appears in HTML when area is null:
```bash
node -e "
import('./templates.js').then(m => {
  const html = m.renderCover({ region: '창원+김해', area: null, week: '2026 25주', weekCode: '2026-25', period: '6.16~6.22', source: '국토교통부', ranking: [] })
  const hasNull = html.includes('>null ')
  console.log(hasNull ? 'FAIL: literal null found' : 'PASS: null guard works')
})
"
```
Expected: `PASS: null guard works`

**Commit:** `fix(card-news): null guard for area in renderCover — prevents "null 실거래가" title`

---

## Wave 0 Completion Checklist

- [ ] SGG_MAP has `48121: 의창구`, `48123: 성산구`
- [ ] All 6 seongsan/uichang AREA_GU_SERIES entries have correct sggCodes
- [ ] 5 fetch functions have `.limit(5000)`
- [ ] `formatPrice` has NaN guard
- [ ] `templates.js` uses `pathToFileURL` — CSS url() values start with `file:///`
- [ ] `capture.js` uses `pathToFileURL(tempPath).href` and `waitUntil: 'load'`
- [ ] `capture.js` launch args include `--font-render-hinting=none`
- [ ] `weekly-generate.yml` has apt-get step with `libgbm1 libasound2t64`
- [ ] `weekly-generate.yml` has `actions/cache@v4` for fonts
- [ ] `card-news/package-lock.json` committed
- [ ] `card-news/.env` exists with both env vars set
- [ ] `renderCover()` with `area=null` produces "전체 실거래가" (not "null 실거래가")
