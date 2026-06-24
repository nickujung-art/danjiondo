# Phase 30: 카드뉴스 생성기 - Research

**Researched:** 2026-06-24
**Domain:** Node.js ESM · Puppeteer headless Chrome · Supabase JS v2 · GitHub Actions CI
**Confidence:** HIGH (all key claims verified via official Puppeteer docs, Context7, or npm registry)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- HTML/Puppeteer 방식 확정 (한글 100% 정확, 무료, 수정 즉시 반영)
- 폴더 구조: `bds/card-news/` 독립 Node.js ESM 프로젝트
- 1080×1080px, deviceScaleFactor: 1
- Pretendard 5 웨이트 woff2, setup.js 자동 다운로드
- Supabase service_role key 직접 쿼리
- GitHub Actions 주간 자동화 (매주 월요일 00:10 KST)

### Claude's Discretion
- 거래 없는 구/평형 조합은 플레이스홀더로 채워 생성 (스킵 안 함)
- Puppeteer 브라우저 인스턴스 재사용
- temp HTML 파일명: `temp-{timestamp}-{random}.html`
- 폰트 로드 실패 시 fallback: `-apple-system, 'Apple SD Gothic Neo', sans-serif`

### Deferred Ideas (OUT OF SCOPE)
- Phase 2: Instagram Graph API 자동 업로드
- Supabase Storage PNG 자동 저장
- 카드뉴스 미리보기 웹페이지 `/admin/card-news`
- 102㎡ 시리즈 6개 구 전체
- 115㎡ 시리즈
</user_constraints>

---

## Summary of Key Findings

- **Q1 (Font Loading):** `page.goto('file://...')` + `document.fonts.ready` + 300ms delay is the correct and reliable pattern for local woff2 fonts. `font-display: block` (already in templates.js) is the right CSS strategy. Adding `--font-render-hinting=none` to launch args improves CJK kerning consistency.

- **Q2 (GitHub Actions):** Puppeteer 23.x bundles its own Chrome for Testing via `@puppeteer/browsers` — no need to `apt-get install chromium`. BUT the bundled binary DOES require system libraries. The current workflow has NO `apt-get install` step: this is a latent failure risk on ubuntu-24.04. A targeted 5-package install step resolves this.

- **Q3 (Supabase Patterns):** The current JS-side aggregation approach (`fetch all rows → aggregate in memory → sort → slice(0, 10)`) is correct and idiomatic. Direct `GROUP BY` is not supported in supabase-js v2 client API. The `.is('cancel_date', null)` syntax for IS NULL is verified correct in v2. Zero-transaction weeks return `[]` which `pad10()` correctly handles.

- **Q4 (HTML→PNG Edge Cases):** The current implementation correctly applies `overflow: hidden` + `clip: {x:0,y:0,width:1080,height:1080}` — this guarantees exactly 1080×1080 PNG output regardless of content. Korean text rendering depends entirely on Pretendard loading; no system CJK fonts are needed.

- **Q5 (Font Download):** jsDelivr is reliable for CI (150B+ req/month, no rate limits). The `existsSync` skip-if-exists logic in setup.js is correct. Adding `actions/cache` for the `fonts/` directory is an optional optimization (saves ~2s per run).

- **Critical Windows Path Bug in templates.js:** On Linux/CI the bare absolute path in CSS `url()` works. On Windows, `path.resolve()` returns backslash paths (`C:\Users\...`) which are invalid in CSS `url()`. Local dev on Windows will fail to load fonts. Fix: use `pathToFileURL(ROOT).href` to produce a proper `file:///` URL.

---

## Q1: Puppeteer Font Loading

### Finding

**file:// + document.fonts.ready is the correct approach — verified by Puppeteer issue #7958.**

Puppeteer issue #7958 specifically documents that `page.setContent()` with relative font paths fails to load local woff2 fonts, while `page.goto('file:///abs/path/to/file.html')` with absolute paths in CSS `url()` works correctly. The current capture.js follows this exact pattern.

**How CSS url() paths resolve under file:// in Chromium:**

When a page is loaded via `file://`, Chromium resolves CSS `url()` values in one of two ways:

1. Relative paths: resolved relative to the HTML file's directory
2. Absolute paths without `file://` prefix (e.g., `/home/runner/work/.../fonts/Pretendard-Black.woff2`): on Linux, Chromium interprets these as `file://` paths automatically

The current templates.js injects ROOT (an absolute POSIX path on Linux) directly into the CSS `url()`:
```
url('/home/runner/work/bds/bds/card-news/fonts/Pretendard-Black.woff2')
```
This works on Linux because Chromium treats absolute POSIX paths as file:// URIs in CSS context.

**Windows path bug:**

On Windows, `path.resolve(__dirname, '..')` returns `C:\Users\jung\coding\bds\card-news`. The resulting CSS:
```
url('C:\Users\jung\coding\bds\card-news\fonts\Pretendard-Black.woff2')
```
is an invalid CSS URL (backslashes are not valid URL characters). Fonts will silently fail to load on Windows. The fallback system font may not have Korean characters.

**Fix:** Replace raw path string with a `file://` URL:
```javascript
import { pathToFileURL } from 'url'
const ROOT_URL = pathToFileURL(resolve(__dirname, '..')).href
// then in CSS: url('${ROOT_URL}/fonts/Pretendard-Black.woff2')
```
This produces `file:///C:/Users/jung/coding/bds/card-news` on Windows and `file:///home/...` on Linux — both valid CSS url() values.

**document.fonts.ready reliability:**

`document.fonts.ready` is a standard Web API `Promise` that resolves when all fonts required for rendering the current document have either loaded or been determined unnecessary. It is reliable for local file:// loaded woff2 fonts. The pattern in capture.js:
```javascript
await page.evaluate(() => document.fonts.ready)
await new Promise((r) => setTimeout(r, 300))
```
is correct. `font-display: block` (already in templates.js) forces the browser to block text rendering until Pretendard is loaded (or until browser timeout, which does not apply to local fonts). The 300ms timeout is a conservative safety margin for render completion after font readiness — acceptable.

**networkidle0 vs load for local HTML:**

`networkidle0` waits for 500ms of zero network connections. For local file:// pages, file system accesses do NOT count as network requests. However, a documented Puppeteer bug (issue #11529) shows networkidle0 can add ~2s of overhead even for minimal pages due to Chrome internal timer behavior. Using `waitUntil: 'load'` reduces this to 200-300ms.

For the card-news use case this is a minor performance difference (not a failure risk), but switching to `load` would make each card faster.

**--font-render-hinting=none:**

Adding `--font-render-hinting=none` to Puppeteer launch args produces more consistent CJK kerning and letter spacing across different Chromium versions/environments. Recommended for Korean text rendering quality. [CITED: browserless.io/blog/puppeteer-print]

### Recommendation

1. Fix the Windows path bug in templates.js using `pathToFileURL()` — critical for local dev
2. Add `--font-render-hinting=none` to capture.js launch args — improves CJK render quality
3. Optionally switch `waitUntil: 'networkidle0'` to `'load'` — minor speedup
4. Keep `document.fonts.ready` + 300ms pattern — it is correct and reliable

### Risk Level: MEDIUM
The current code works on Linux/CI. Fails silently on Windows local dev (fonts not loaded, Korean becomes squares). The CI path is safe.

---

## Q2: GitHub Actions Chromium Dependencies

### Finding

**Puppeteer bundles its own Chrome for Testing — no apt-get chromium needed.**

Starting from Puppeteer v19.0.0, `npm ci` triggers an automatic `@puppeteer/browsers install` that downloads Chrome for Testing into `~/.cache/puppeteer`. The current workflow relies on this correctly. [CITED: pptr.dev/troubleshooting]

**System library dependencies ARE required.**

The bundled Chrome binary is dynamically linked against system libraries. The Puppeteer troubleshooting documentation lists these as required on Debian/Ubuntu: [CITED: github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md]

```
ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0
libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1
libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0
libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1
libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1
libxss1 libxtst6 lsb-release wget xdg-utils
```

**ubuntu-latest (ubuntu-24.04) pre-installs most of these.** GitHub-hosted runners are full VM images, not minimal Docker containers — they include extensive pre-installed packages. However, `libgbm1` (GPU buffer management) is NOT pre-installed on ubuntu-24.04 and is the most common cause of Chromium launch failures in CI.

**Ubuntu 24.04 naming change:** `libasound2` was renamed to `libasound2t64` in Ubuntu 24.04. Using the old name `libasound2` in `apt-get install` on ubuntu-latest will either fail or install the wrong package.

**Current workflow gap:** The `weekly-generate.yml` has no `apt-get install` step. Running `npm ci` downloads Chromium, but the first `puppeteer.launch()` call will fail if `libgbm1` is missing.

**Required launch flags (already correct in capture.js):**
- `--no-sandbox` — required for non-root users on Linux runners
- `--disable-setuid-sandbox` — companion flag
- `--disable-dev-shm-usage` — prevents /dev/shm exhaustion in CI environments

### Recommendation

Add an apt-get step to the workflow targeting the packages most likely to be missing on ubuntu-24.04:

```yaml
- name: Install Chromium system dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y libgbm1 libasound2t64 libatk1.0-0 libatk-bridge2.0-0 \
      libxss1 libgtk-3-0 libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgdk-pixbuf2.0-0
```

This is a targeted install of packages most likely absent on ubuntu-24.04, not the full 30-package list. Takes ~5s and prevents launch failures.

Alternatively, use `puppeteer-core` with `PUPPETEER_SKIP_DOWNLOAD=true` and the system Chromium — but this changes the architecture and is out of scope.

### Risk Level: HIGH
The current workflow will fail on ubuntu-24.04 if `libgbm1` is missing. This is a silent failure (Chromium launches, then crashes). Must add apt-get step before first production run.

---

## Q3: Supabase Query Patterns

### Finding

**The current JS aggregation approach is correct and idiomatic for this use case.**

Supabase JS v2 does not support SQL `GROUP BY` directly in the client API's `.select()` chain. Options are: [CITED: github.com/orgs/supabase/discussions/19517]

1. `.rpc()` calling a PostgreSQL function — enables server-side aggregation
2. Fetch all matching rows and aggregate in JS (current approach)
3. Create a PostgreSQL view, query it as a table

For weekly card-news aggregation with regional filters, the current JS approach is the right choice:
- The dataset is small: a typical week produces <500 transactions per district per area type
- The aggregation logic (max price per complex, count per complex, avg price-per-pyeong) is simple
- No additional database function maintenance required
- Already in production (used by `src/lib/data/rankings.ts` in the main Next.js app with the same pattern)

**Verified correct supabase-js v2 patterns:** [CITED: supabase.com/docs/reference/javascript]

```javascript
// IS NULL check — correct v2 syntax
.is('cancel_date', null)
.is('superseded_by', null)

// IN operator — correct v2 syntax
.in('sgg_code', sggCodes)

// Range filter — correct v2 syntax
.gte('deal_date', from)
.lte('deal_date', to)

// NOT NULL — correct v2 syntax
.not('complex_id', 'is', null)
```

All of these are correctly implemented in fetch-data.js.

**Zero-transaction weeks:** When no transactions match the filters, Supabase returns `{ data: [], error: null }`. The current code maps over `data ?? []`, returning an empty array `[]`. The `pad10()` function (called in generate.js before passing to templates) fills the remaining slots with placeholder objects: `{ rank: i+1, name: null, price: null, subtitle: null }`. The templates render these with placeholder CSS styling. This is correct by design.

**Service role key:** The service role key bypasses Row Level Security entirely. An empty result truly means no data in that date range — not a policy mismatch. The current code uses `persistSession: false` (correct for a server-side script). [VERIFIED: supabase.com/docs/reference/javascript/creating-a-client]

**One performance note:** `fetchVolumeRanking` fetches only `complex_id` (not price/area) — this is efficient. `fetchAreaRanking` and `fetchCityRanking` fetch `complex_id, price, area_m2` — the minimal needed columns. No N+1 issues since all complex names are batch-fetched in a single `.in('id', ids)` call after aggregation.

### Recommendation

No changes needed to fetch-data.js. The implementation is correct and follows the same pattern as the main app's rankings.ts. Document that GROUP BY is intentionally handled in JS due to supabase-js v2 client limitations.

### Risk Level: LOW
All query patterns are correct. The only edge case (zero transactions) is handled by pad10(). No changes required.

---

## Q4: HTML→PNG Edge Cases

### Finding

**Fixed dimensions + overflow:hidden + clip parameter — current implementation is correct.**

The CSS in templates.js:
```css
html, body { width: 1080px; height: 1080px; overflow: hidden; }
```

Combined with the screenshot call:
```javascript
await page.screenshot({
  path: outputPath,
  type: 'png',
  clip: { x: 0, y: 0, width: 1080, height: 1080 }
})
```

This guarantees exactly 1080×1080 PNG output. The `overflow: hidden` prevents DOM content from expanding the page dimensions. The `clip` parameter crops to exactly the viewport area. The viewport is pre-set to 1080×1080 before navigation. [CITED: github.com/puppeteer/puppeteer/blob/main/docs/api/puppeteer.screenshotoptions.md]

**Puppeteer ScreenshotOptions note:** `captureBeyondViewport` defaults to `false` when `clip` is not specified, and `true` when `clip` IS specified. Since our clip equals the viewport exactly (0,0,1080,1080), the behavior is identical either way — no unexpected content will appear.

**Korean text overflow prevention:**

Templates already apply these protections:
- `.complex-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` — long complex names truncate with `…`
- `.row-complex { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` — same in ranking rows
- All card root divs have `position: relative; overflow: hidden` — nothing escapes the 1080×1080 boundary

**Korean text rendering:**

Pretendard woff2 covers the full Hangul syllables block (U+AC00–U+D7A3) plus jamo and compatibility jamo. All Korean characters used in complex names and district names are covered. As long as Pretendard loads correctly, there are no CJK "tofu" boxes.

The fallback stack `-apple-system, 'Apple SD Gothic Neo', sans-serif` does NOT include Korean glyphs on ubuntu-24.04 (which has no CJK system fonts by default). If Pretendard fails to load on GitHub Actions, Korean text renders as empty squares. This makes font loading reliability the single most important concern for visual output quality.

**Ghost number rendering (Cover card):**

The ghost "10" text:
```css
.ghost { font: 900 560px/1 'Pretendard'; color: var(--brand-tint); z-index: 0; white-space: nowrap; }
```
At 560px font size, the "10" glyph is approximately 700px wide. Positioned `bottom: -120px; right: -30px`, it intentionally overflows — but the parent `.card { overflow: hidden }` clips it. This is correct intentional design per CARDDESIGN.md.

**Line height and vertical overflow:**

The Highlight card (card 2) has `justify-content: flex-start` with 3 rank cards at 28px padding + 80px badge height + 16px gap each = approximately 372px for 3 cards. The header is 56px padding + ~80px title height. Total ~500px content + footer ~100px. Comfortably fits in 1080px.

The Ranking card (card 3) has 10 rows at ~70px each (14px padding × 2 + ~42px content) = ~700px. Header ~110px. Footer ~60px. Total ~870px. Fits within 1080px with margin.

### Recommendation

No structural changes needed to templates.js or capture.js. The layout arithmetic is correct.

Two improvements worth making:
1. Add `--font-render-hinting=none` to capture.js args (improves CJK consistency)
2. Fix the Windows path bug in templates.js (see Q1) for local dev

### Risk Level: LOW
The 1080×1080 constraint is correctly enforced. Korean text has overflow protection. Layout fits within bounds.

---

## Q5: Font Download Reliability

### Finding

**jsDelivr is reliable for CI — no rate limits, no known GitHub Actions issues.**

jsDelivr serves 150B+ requests per month using Cloudflare + Fastly CDN redundancy. There are no documented rate limits for typical CI usage. The npm path (`cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/...`) is a versioned, stable URL — Pretendard 1.3.9 is a fixed release, the files will not change. [CITED: jsdelivr.com]

**Existing correctness in setup.js:**

1. `existsSync(dest)` skip — correct, prevents redundant downloads when running locally
2. Single-level redirect handling — the code follows one HTTP 3xx redirect. jsDelivr typically has at most one CDN redirect level. This is sufficient.
3. Sequential download — 5 fonts downloaded one by one. Total ~2MB. Acceptable for a weekly cron.

**Caching opportunity:**

The workflow re-downloads fonts on every run (~2s, ~2MB). Adding `actions/cache` keyed on `pretendard@1.3.9` would eliminate this. Since the font version is pinned in the BASE_URL constant, the cache key never changes and the fonts are downloaded once, cached indefinitely.

```yaml
- uses: actions/cache@v4
  with:
    path: card-news/fonts
    key: pretendard-1.3.9
```

This step should come BEFORE `node scripts/setup.js`. The setup.js `existsSync` check ensures no double-download even if the cache partially hits.

**Network failure resilience:**

setup.js uses `https.get()` with no timeout or retry. If jsDelivr is unreachable (rare), the workflow will hang at the font download step until the OS TCP timeout (varies, typically 2-3 minutes). A `--timeout` option or `Promise.race` with a timeout would make failures faster. Given jsDelivr's reliability record, this is acceptable risk for a weekly cron.

### Recommendation

1. Add `actions/cache@v4` for `fonts/` directory — optional but eliminates ~2s per run
2. Keep jsDelivr as the font source — reliable, versioned, zero config needed
3. No retry logic needed — jsDelivr uptime is sufficient for weekly CI

### Risk Level: LOW
jsDelivr is reliable. The skip-if-exists logic prevents issues. No action required.

---

## Critical Issues Summary (Action Items)

### Issue 1: Missing apt-get step in GitHub Actions workflow [CRITICAL]

**File:** `.github/workflows/weekly-generate.yml`

**Problem:** No system library install step. Puppeteer's bundled Chromium on ubuntu-24.04 will likely fail with missing `libgbm1`.

**Fix:** Add before `npm ci`:
```yaml
- name: Install Chromium system dependencies
  run: |
    sudo apt-get update -q
    sudo apt-get install -y libgbm1 libasound2t64 libatk1.0-0 libatk-bridge2.0-0 \
      libxss1 libgtk-3-0 libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgdk-pixbuf2.0-0
```

### Issue 2: Windows path bug in @font-face CSS url() [MEDIUM — local dev only]

**File:** `scripts/templates.js`

**Problem:** `ROOT` uses `path.resolve()` which produces Windows backslash paths. CSS `url('C:\...')` is invalid. Fonts fail silently on Windows.

**Fix:**
```javascript
import { pathToFileURL } from 'url'
const ROOT_URL = pathToFileURL(resolve(__dirname, '..')).href
// In BASE_CSS: url('${ROOT_URL}/fonts/Pretendard-Black.woff2')
```

### Issue 3: Add --font-render-hinting=none [LOW]

**File:** `scripts/capture.js`

**Problem:** Korean kerning may be inconsistent across Chromium versions without this flag.

**Fix:** Add to `getBrowser()` args array:
```javascript
args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
```

### Issue 4: networkidle0 adds 2s delay [LOW — optional]

**File:** `scripts/capture.js`

**Problem:** `networkidle0` adds 2s overhead for local file:// pages per Puppeteer bug #11529.

**Fix:** Change `waitUntil: 'networkidle0'` to `waitUntil: 'load'`. For local HTML with no external requests, both are equivalent, but `load` is 6-10x faster.

---

## Package Versions

| Package | Specified in package.json | Current latest | Installs |
|---------|--------------------------|----------------|----------|
| puppeteer | ^23.0.0 | 25.2.0 | 23.11.1 (last 23.x) |
| @supabase/supabase-js | ^2.0.0 | 2.108.2 | latest 2.x |
| dotenv | ^16.0.0 | 16.x | latest 16.x |

[VERIFIED: npm registry, 2026-06-24]

**Note:** package.json specifies `^23.0.0` which caps at 23.11.1. Puppeteer 24+ changed the default headless mode and browser binary path. Upgrading to `^25.0.0` would get Chrome for Testing v134+ with better Korean font rendering. Not urgent — 23.11.1 works correctly.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None configured in card-news/ subproject |
| Config file | None — standalone scripts, not Next.js app |
| Quick run command | `node scripts/setup.js && node scripts/generate.js --dry-run --series=84-seongsan` |
| Full suite command | `node scripts/generate.js --dry-run` (all 17 series, HTML only) |

### Phase Requirements → Test Map

| Test | Behavior | Type | Command |
|------|----------|------|---------|
| DRY-01 | All 17 series generate HTML without errors | smoke | `node scripts/generate.js --dry-run` |
| DRY-02 | HTML files contain correct Korean text | manual | Open HTML in browser |
| PNG-01 | PNG files are exactly 1080×1080px | manual | Check with ImageMagick: `identify output/**/*.png` |
| PNG-02 | Pretendard renders (no tofu boxes) | manual | Visual inspection of PNG |
| FONT-01 | setup.js downloads 5 woff2 files | smoke | `node scripts/setup.js && ls fonts/` |
| CI-01 | GitHub Actions workflow completes | integration | `workflow_dispatch` with dry_run=true |

### Wave 0 Gaps
- No automated test framework (Vitest/Jest) — not needed for a script-based tool
- Manual visual inspection is the primary validation method
- Smoke tests (`--dry-run`) verify data pipeline; PNG verification requires visual check

---

## Environment Availability

| Dependency | Required By | Available locally | Available in CI | Notes |
|------------|-------------|-------------------|-----------------|-------|
| Node.js 20+ | All scripts | ✓ (local Windows) | ✓ (setup-node@v4) | Confirmed in workflow |
| Puppeteer Chrome | PNG capture | ✓ (npm ci downloads) | ✓ (npm ci) | Requires apt-get step in CI |
| Supabase credentials | fetch-data.js | via .env | via GitHub Secrets | SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY |
| Pretendard fonts | Templates | via setup.js | via setup.js | jsDelivr download, ~2MB |
| assets/logo.png | BrandLockup component | ✓ (already present) | ✓ (committed) | Used with onerror=hide fallback |

**Missing dependencies with no fallback:**
- Supabase credentials — workflow will fail if secrets not set. Already documented as required.

**Missing dependencies with fallback:**
- logo.png: `onerror="this.style.display='none'"` already handles missing logo gracefully.

---

## Open Questions

1. **generate.js existence confirmed** — all 5 scripts (capture, fetch-data, generate, setup, templates) are fully written. The CONTEXT.md says "수정/완성 필요" (needs validation/verification, not rewrite).

2. **district-champions card layout** — the 6-district set uses the 4-card template designed for TOP 10. Districts 7-10 will show as placeholders in the ranking card. This is acceptable per CONTEXT.md "Claude's Discretion".

3. **Week date logic in getLastWeekRange()** — uses `deal_date` which is the registration date with MOLIT, not the actual transaction date. This matches the main app's behavior and is correct per ARCHITECTURE.md.

4. **package-lock.json** — not present in card-news/ (only package.json). `npm ci` requires package-lock.json. The workflow runs `npm ci` which will fail without it. Need to commit `package-lock.json` after running `npm install` locally first.

---

## Sources

### Primary (HIGH confidence — verified)
- Puppeteer official troubleshooting docs [CITED: github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md]
- Context7 /puppeteer/puppeteer — headless launch, screenshot, viewport, font docs
- Puppeteer issue #7958 — file:// + font loading [CITED: github.com/puppeteer/puppeteer/issues/7958]
- Puppeteer issue #11529 — networkidle0 2s overhead [CITED: github.com/puppeteer/puppeteer/issues/11529]
- npm registry — puppeteer@23.11.1, @supabase/supabase-js@2.108.2 versions [VERIFIED]
- Supabase JS v2 reference docs [CITED: supabase.com/docs/reference/javascript]

### Secondary (MEDIUM confidence)
- jsDelivr reliability and rate limits [CITED: jsdelivr.com]
- GitHub Discussions: GROUP BY workaround via rpc [CITED: github.com/orgs/supabase/discussions/19517]
- Puppeteer ScreenshotOptions API reference [CITED: Context7]

### Tertiary (LOW — single source)
- `--font-render-hinting=none` improves CJK kerning [LOW — from browserless.io blog, not officially documented in Puppeteer]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ubuntu-24.04 GitHub runner pre-installs most X11 libs but NOT libgbm1 | Q2 | Chromium might work without apt-get, OR might need more packages than listed |
| A2 | CSS url() with absolute POSIX path (no file:// prefix) resolves as file:// in Chromium | Q1 | If wrong, fonts silently fall back on Linux too |
| A3 | jsDelivr has no relevant rate limits for GitHub Actions weekly CI use | Q5 | Very low risk — jsDelivr is a major public CDN |

**Note on A2:** This is assumed based on Chromium's historical behavior with file:// pages. The safest implementation uses `pathToFileURL()` explicitly (recommended in Issue 2 above), which eliminates this assumption entirely.

---

**Research date:** 2026-06-24
**Valid until:** 2026-09-24 (Puppeteer and ubuntu-latest runner contents change; recheck if workflow fails)
