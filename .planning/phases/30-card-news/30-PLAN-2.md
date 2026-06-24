# Phase 30 — GitHub Actions & Polish PLAN

**Wave:** 2
**Goal:** Confirm the automated weekly workflow is production-ready and update project documentation.
**Estimated time:** 20–30 min
**Commit strategy:** One commit per task

## Pre-conditions

- Wave 0 and Wave 1 completed successfully
- `card-news/package-lock.json` committed
- GitHub remote configured (`git remote -v` shows origin)
- GitHub repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set (Settings → Secrets → Actions)
- Local PNG generation works (Wave 1 Task 1.3 passed)

---

## Task 2.1: Validate Workflow YAML Syntax

**File(s):** `card-news/.github/workflows/weekly-generate.yml`

**Action:** VERIFY

**Spec:**

Validate the YAML syntax locally before pushing:

```bash
node -e "
const fs = require('fs');
const yaml = require('js-yaml');
try {
  const content = fs.readFileSync('../card-news/.github/workflows/weekly-generate.yml', 'utf8');
  yaml.load(content);
  console.log('YAML: valid');
} catch(e) {
  console.error('YAML ERROR:', e.message);
  process.exit(1);
}
" 2>/dev/null || node -e "
// fallback: check key fields exist
const fs = require('fs');
const c = fs.readFileSync('card-news/.github/workflows/weekly-generate.yml', 'utf8');
const checks = ['libgbm1', 'libasound2t64', 'pretendard-1.3.9', 'actions/cache@v4', 'npm ci', 'node scripts/setup.js', 'node scripts/generate.js'];
checks.forEach(s => console.log(c.includes(s) ? 'OK: '+s : 'MISSING: '+s));
"
```

Expected: all 7 fields present in the workflow file.

Manual review of `card-news/.github/workflows/weekly-generate.yml` — confirm the step order is:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` (with `cache-dependency-path: card-news/package-lock.json`)
3. `Install Chromium system dependencies` (apt-get with libgbm1 etc.)
4. `Install dependencies` (npm ci)
5. `Cache Pretendard fonts` (actions/cache@v4, key: pretendard-1.3.9)
6. `Download Pretendard fonts` (node scripts/setup.js)
7. `Generate card news` (node scripts/generate.js with env secrets)
8. `Upload PNG artifacts` (actions/upload-artifact@v4, retention-days: 30)

**Commit:** none (verification only; if fixes needed, commit as `fix(card-news): correct workflow step order`)

---

## Task 2.2: Add Supabase Error Handling to fetch-data.js

**File(s):** `card-news/scripts/fetch-data.js`

**Action:** EDIT

**Spec:**

The current code `throw new Error(...)` on Supabase errors which causes the entire `generate.js` run to crash. For a weekly cron, a single series failure should be isolated — the other series should still generate.

Add a connection check helper at the top of fetch-data.js (after the `supabase` client creation):

```js
// Validate env vars at startup — fail fast with a clear message
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n' +
    'Create card-news/.env with these values.'
  )
}
```

This check throws immediately when the script starts (not buried in the first fetch call), producing a readable error message instead of "Cannot read property of undefined".

**Also:** In `generate.js` main(), wrap each series generation in a try-catch to allow partial success:

Find the `for (const s of AREA_GU_SERIES)` loop (around line 127) and add error isolation:

```js
for (const s of AREA_GU_SERIES) {
  if (filter && !filter.includes(s.id)) continue
  console.log(`[${s.id}] ${s.region} ${s.area}`)
  try {
    const ranking = await fetchAreaRanking({ sggCode: s.sggCode, areaMin: s.areaMin, areaMax: s.areaMax })
    const data = { ...baseWeekData, region: s.region, area: s.area, seriesType: 'area', ranking: pad10(ranking) }
    await generateCardSet(s.id, data, dryRun)
  } catch (err) {
    console.error(`  [ERROR] ${s.id}: ${err.message}`)
  }
}
```

Apply the same try-catch pattern to the CITY_SERIES loop and the district-champions block.

This ensures one bad series (e.g. unexpected Supabase schema change) doesn't abort the other 16.

**Verify:** Temporarily set a wrong SUPABASE_URL and run:
```bash
node scripts/generate.js --dry-run --series=84-seongsan
```
Expected: clear error message about missing credentials (not a JavaScript stack trace about undefined).

Restore correct `.env` after verification.

**Commit:** `feat(card-news): add env validation + per-series error isolation`

---

## Task 2.3: Trigger `workflow_dispatch` Dry-Run (Manual Verification)

**File(s):** GitHub Actions UI

**Action:** HUMAN VERIFY

**Spec:**

After pushing all Wave 0–2 commits to GitHub, trigger a manual dry-run via the GitHub Actions UI:

1. Push current branch:
   ```bash
   git push origin main
   ```

2. In GitHub: go to the repository → Actions → "Weekly Card News Generation" → "Run workflow"

3. Set options:
   - `dry_run`: checked (true)
   - `series`: `84-seongsan` (single series for speed)

4. Click "Run workflow"

5. Monitor the run. Expected steps to pass:
   - Install Chromium system dependencies (~10s)
   - Install dependencies / npm ci (~60s, downloads Puppeteer Chrome)
   - Cache Pretendard fonts (cache miss on first run; subsequent hits)
   - Download Pretendard fonts (~5s first run)
   - Generate card news (dry-run: ~10s)
   - Upload PNG artifacts (dry-run generates HTML, not PNG — artifact may be empty)

6. **After dry-run succeeds:** Trigger a second `workflow_dispatch` with PNG mode to validate Chromium actually launches:
   - `dry_run`: **unchecked** (false)
   - `series`: `84-seongsan`

   Expected: 4 PNG files appear in the artifact download. If Chromium fails to launch (libgbm1 issue), this is the trigger — fix the apt-get step in the YAML and push.

7. If the run succeeds (green checkmark): workflow is production-ready.

**If the run fails:**
- `npm ci`: missing package-lock.json → check Wave 0 Task 0.5
- Chromium crash (exit code 1): missing system library → check apt-get step has `libgbm1`
- `SUPABASE_URL is undefined`: GitHub secrets not set → Settings → Secrets → Actions → add secrets
- `node scripts/generate.js: not found`: working-directory issue → confirm `defaults.run.working-directory: card-news` in YAML

**Commit:** none (Actions run is server-side)

---

## Task 2.4: Update ROADMAP.md Phase 30

**File(s):** `.planning/ROADMAP.md`

**Action:** EDIT

**Spec:**

Find the Phase 30 entry in `.planning/ROADMAP.md` and update its status:

1. Change status from `[ ]` (todo) to `[x]` (done) for each plan
2. Add a brief completion note

Example update:
```markdown
### Phase 30: 인스타 카드뉴스 생성기
**Status:** done
**Completed:** 2026-06-24

Plans:
- [x] 30-PLAN-0.md — Bug fixes & environment setup
- [x] 30-PLAN-1.md — Local end-to-end test
- [x] 30-PLAN-2.md — GitHub Actions & polish
```

**Commit:** `docs: mark Phase 30 complete in ROADMAP.md`

---

## Task 2.5: Update CLAUDE.md Feature Table

**File(s):** `CLAUDE.md` (bds project root)

**Action:** EDIT

**Spec:**

Add Phase 30 to the "완료된 주요 기능" table in `CLAUDE.md`:

Find the table:
```markdown
| 기능 | 상태 |
|---|---|
| ... existing rows ...
```

Add a new row after the last existing entry:
```markdown
| 인스타 카드뉴스 생성기 (Puppeteer·GitHub Actions 주간 자동화) | ✅ |
```

Also update the session start note if it references a date:
The current "현재 구현 단계 (2026-06-16 기준)" header can be updated to `(2026-06-24 기준)`.

**Commit:** `docs(claude): add card-news generator to completed features table`

---

## Wave 2 Completion Checklist

- [ ] `weekly-generate.yml` YAML is valid and step order is correct
- [ ] All 7 required elements present in workflow file
- [ ] Supabase connection failure produces readable error message
- [ ] Series failures are isolated (one failure doesn't abort all)
- [ ] `workflow_dispatch` dry-run completes green in GitHub Actions
- [ ] Chromium deps step passes (no libgbm1 missing error)
- [ ] ROADMAP.md Phase 30 marked done
- [ ] CLAUDE.md table updated with card-news entry

---

## Phase 30 Overall Completion

After Wave 2, the card-news system is fully operational:

| Deliverable | Status |
|---|---|
| 4-card PNG set (1080×1080) per series | Generated locally |
| 17 series (구별 84/59/102㎡ + 도시 전체 + 대장단지) | Tested |
| CARDDESIGN.md visual compliance | Verified |
| GitHub Actions weekly cron (Mon 00:10 KST) | Configured |
| `workflow_dispatch` manual trigger with dry-run | Verified |
| Supabase credentials via GitHub Secrets | Set |
| PNG artifacts stored 30 days | Configured |

**Next phase (deferred):** Instagram Graph API auto-upload, Supabase Storage persistence, `/admin/card-news` preview page.
