# Phase 30 — Local End-to-End Test PLAN

**Wave:** 1
**Goal:** Verify the full pipeline locally — fonts download, HTML renders correctly, PNGs are generated at correct dimensions, and design matches CARDDESIGN.md.
**Estimated time:** 45–60 min (includes visual inspection)
**Commit strategy:** No code changes expected; commits only if a bug is discovered and fixed.

## Pre-conditions

- Wave 0 tasks completed and committed
- `card-news/.env` exists with valid SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
- `card-news/package-lock.json` exists (from Wave 0 Task 0.5)
- `node_modules/` is present (from Wave 0 `npm install`)
- `card-news/assets/logo.png` exists
- Working directory for all commands: `C:\Users\jung\coding\bds\card-news`

---

## Task 1.1: Font Setup Verification

**File(s):** `card-news/fonts/` (created by setup.js)

**Action:** RUN

**Spec:**

Run the font downloader and verify all 5 woff2 files are present:

```bash
node scripts/setup.js
```

Expected output (first run — downloads):
```
  downloading Pretendard-Black.woff2 ... done
  downloading Pretendard-ExtraBold.woff2 ... done
  downloading Pretendard-Bold.woff2 ... done
  downloading Pretendard-SemiBold.woff2 ... done
  downloading Pretendard-Medium.woff2 ... done

Fonts ready. Run: node scripts/generate.js
```

On second run (files already exist):
```
  skip (exists): .../fonts/Pretendard-Black.woff2
  ...
```

Verify all 5 files were written:
```bash
ls card-news/fonts/
```

Expected: `Pretendard-Black.woff2  Pretendard-Bold.woff2  Pretendard-ExtraBold.woff2  Pretendard-Medium.woff2  Pretendard-SemiBold.woff2`

**Verify:** `ls card-news/fonts/*.woff2 | wc -l` returns `5`

**If fonts fail to download:** Check internet connectivity. jsDelivr is reliable — if it fails, retry once. If it continues to fail, check if `card-news/fonts/` directory is writable.

---

## Task 1.2: Dry-Run Single Series (HTML Inspection)

**File(s):** `card-news/output/<week-code>/84-seongsan/` (generated HTML files)

**Action:** RUN + VISUAL INSPECT

**Spec:**

Run a single series in dry-run mode to generate HTML output without Puppeteer:

```bash
node scripts/generate.js --dry-run --series=84-seongsan
```

Expected console output:
```
창원부동산랩 카드뉴스 생성
주차: 2026년 6월 X주차 (2026-WXX)
기간: XX.XX ~ XX.XX 신고 건
모드: 드라이런 (HTML만)

[84-seongsan] 창원 성산구 84㎡
  [dry] wrote 01-cover.html
  [dry] wrote 02-highlight.html
  [dry] wrote 03-ranking.html
  [dry] wrote 04-closing.html

완료! → output/2026-WXX/
```

Locate the output:
```bash
ls card-news/output/*/84-seongsan/
```

Open all 4 HTML files in a browser and inspect:

**01-cover.html — check:**
- Blue top bar (14px, #0066FF)
- "창원부동산랩" brand lockup top-left
- "WEEKLY REPORT · 2026년 X월 X주차" eyebrow in blue
- Title shows "창원 성산구 / 84㎡ 실거래가 / 랭킹 TOP 10" in three large lines
- Ghost "10" in light blue bottom-right (partially clipped)
- Caption text bottom-left
- Location pin + "창원 성산구 · 전용 84㎡ 기준" bottom

**02-highlight.html — check:**
- Light gray background (#F7F8FA)
- "HIGHLIGHT" eyebrow + "최고가 거래 TOP 3" heading
- 1st card: navy (#152038) background, gold badge, white text, gold price
- 2nd and 3rd cards: white background, gray badge
- If week has no data: all 3 cards show placeholder gray "단지명 입력" / "0억 0,000"

**03-ranking.html — check:**
- White background
- 10 rows; 1st row rank number in gold (#FFAB00); rest in gray
- Row text truncates with ellipsis if complex name is long
- If rows 4–10 have no data: placeholder gray text

**04-closing.html — check:**
- Navy (#152038) background
- "창원부동산랩" in white
- "매주 업데이트되는 창원 실거래가 리포트" with "실거래가 리포트" in gold
- Blue "팔로우 +" button + outlined "저장하기" button
- Small gray disclaimer text at bottom

**If Supabase returns an error:** Check `.env` credentials. An empty ranking result (no transactions last week) is fine — placeholders will show.

---

## Task 1.3: Generate PNG for Single Series

**File(s):** `card-news/output/<week-code>/84-seongsan/` (4 PNG files)

**Action:** RUN

**Spec:**

Run the full PNG capture for the 성산구 84㎡ series:

```bash
node scripts/generate.js --series=84-seongsan
```

Expected console output:
```
창원부동산랩 카드뉴스 생성
주차: 2026년 6월 X주차 (2026-WXX)
기간: XX.XX ~ XX.XX 신고 건
모드: PNG 생성

[84-seongsan] 창원 성산구 84㎡
  ✓ 01-cover.png
  ✓ 02-highlight.png
  ✓ 03-ranking.png
  ✓ 04-closing.png

완료! → output/2026-WXX/
```

If the command hangs or crashes, it is likely a Puppeteer/Chromium issue. On Windows the most common cause is that Puppeteer's bundled Chromium can't find all system deps — but on Windows these are bundled within the npm package, so it should work. If Chromium fails to launch, check for error messages about missing `.dll` files.

**Verify dimensions:** If `magick` (ImageMagick) is available:
```bash
magick identify card-news/output/*/84-seongsan/*.png
```
Each line should show `1080x1080`.

Alternatively, check file sizes — a blank 1080×1080 PNG is ~5KB, a rendered card is typically 200–600KB:
```bash
ls -lh card-news/output/*/84-seongsan/*.png
```
Expected: each file 150KB–700KB.

**Commit:** none (output files are gitignored)

---

## Task 1.4: Visual Quality Inspection (Checkpoint)

**File(s):** `card-news/output/<week-code>/84-seongsan/*.png`

**Action:** VISUAL INSPECT (human checkpoint)

**Spec:**

Open the 4 generated PNG files in any image viewer and check against CARDDESIGN.md spec.

**CARDDESIGN.md compliance checklist:**

Card 1 (cover):
- [ ] Canvas exactly 1080×1080 (no white border, no clipping of card edges)
- [ ] Pretendard loads — no "tofu" squares for Korean characters
- [ ] Font weights visible: brand name is SemiBold/Bold, title lines are Black (900), ghost "10" is Black (900)
- [ ] Top bar is solid blue, exactly 14px tall
- [ ] No gradients anywhere (forbidden by CONTEXT.md)

Card 2 (highlight):
- [ ] 1st place card is navy, not dark blue or black-ish; badge is gold
- [ ] Price color on 1st card is `#FFC93C` (gold), not white
- [ ] 2nd and 3rd place cards are white with thin border

Card 3 (ranking):
- [ ] 10 rows visible; row 1 rank number is gold `#FFAB00`
- [ ] Placeholder rows (if any) show gray "단지명 입력"
- [ ] No content overflows the 1080px bottom edge

Card 4 (closing):
- [ ] Background is `#152038` (dark navy), not black
- [ ] "실거래가 리포트" text is gold `#FFC93C`

**If Korean renders as squares:** fonts failed to load. Check that `card-news/fonts/` is populated and the `file:///` paths in templates.js CSS are correct (Wave 0 Task 0.3).

**If any CARDDESIGN.md requirement fails:** Diagnose and fix templates.js or capture.js, then re-run Task 1.3.

---

## Task 1.5: Full Generation Run (All Series)

**File(s):** `card-news/output/<week-code>/` (17 series × 4 cards = 68 PNG files)

**Action:** RUN

**Spec:**

Run the complete generation for all 17 series:

```bash
node scripts/generate.js
```

This will:
- 14 AREA_GU_SERIES (84/59/102 × 6/6/2 districts)
- 3 CITY_SERIES (city-overall, city-volume, city-value-84)
- 1 district-champions series
- Total: 17 series × 4 cards = 68 PNG files

Expected runtime: 2–5 minutes on Windows (Puppeteer launches once, reuses browser for all cards).

Monitor for errors — any `throw new Error` from fetch-data.js or Puppeteer crashes will stop the run.

After completion:
```bash
ls card-news/output/*/  # list all series directories
ls card-news/output/*/**/*.png | wc -l  # count PNG files
```

Expected: 68 PNG files (or fewer if some series produce errors, which is a bug to fix).

**Series to verify specifically:**
- `84-seongsan` and `84-uichang` should show DIFFERENT data (BUG-1 fix verification)
- `city-overall` should have subtitle text visible (검색어별 캡션)
- `district-champions` should have 6 rows filled, 4 placeholder rows

**Commit:** none (output is gitignored)

---

## Task 1.6: Edge Case — Low-Volume District

**File(s):** `card-news/output/<week-code>/59-jinhae/` (4 PNG files)

**Action:** RUN + VISUAL INSPECT

**Spec:**

진해구 59㎡ is expected to have very few transactions in any given week. This tests the placeholder logic.

```bash
node scripts/generate.js --series=59-jinhae
```

Inspect the generated PNGs:
- Ranking card: some rows should show actual complex names; remaining rows should show gray "단지명 입력" and "0억 0,000" placeholders
- Highlight card: if fewer than 3 transactions, rows 2 and/or 3 should show placeholder styling

Verify placeholder rows are styled with `var(--placeholder)` (#C4CAD3) — light gray — not black or missing.

**If all 10 rows are placeholders:** 진해구 had zero 59㎡ transactions last week. This is valid — the card should still generate without error.

**Commit:** Commit any bug fixes found during edge case testing:
- `fix(card-news): [describe the fix]`

---

## Wave 1 Completion Checklist

- [ ] `node scripts/setup.js` downloads 5 woff2 files to `card-news/fonts/`
- [ ] Dry-run HTML output shows correct Korean text and CARDDESIGN.md layout
- [ ] 84-seongsan generates 4 PNG files
- [ ] PNG files are 1080×1080 (verified by size or ImageMagick)
- [ ] Pretendard renders correctly — no tofu squares
- [ ] Card colors match CARDDESIGN.md tokens
- [ ] No content overflows card boundaries
- [ ] 성산구 and 의창구 series show different data (BUG-1 was fixed)
- [ ] Low-volume series (59-jinhae) generates with placeholders, no crash
- [ ] Full run completes all 17 series without error
