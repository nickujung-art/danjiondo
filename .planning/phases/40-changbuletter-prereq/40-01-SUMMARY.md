---
phase: 40-changbuletter-prereq
plan: 01
subsystem: card-news
tags: [card-news, changbuletter, refactor, golden-regression, prereq-0-4]

requires: []
provides:
  - "buildSlides(data) / buildChampionSlides(data) / buildContentMeta(seriesId, data, to) — 순수 함수"
  - "subLine(region, area) — templates.js 와 공유하는 유일한 문구 생성기"
  - "generate.js --out / --dump-data / --data 재현 하네스"
  - "card-news/fixtures/** 골든 회귀 하네스 (DB 불필요)"
affects:
  - "40-03 (contents 적재) — buildSlides/buildContentMeta 를 소비한다"
  - "40-04 (소급 재생성) — --from/--to 가 champions 에도 먹힌다"
  - "40-05 / 0-6 (리브랜딩) — 골든을 의도적으로 깨므로 재생성 절차 필요"

tech-stack:
  added: []          # 신규 의존성 0건. card-news/package.json 무변경
  patterns:
    - "순수 함수 모듈 (import 0건) → env 없는 환경에서도 테스트 가능"
    - "SHA 기반 before/after 되돌리기 (git stash 금지 — 커밋 뒤라 no-op)"
    - "골든 픽스처 + .gitattributes '* -text' 로 CRLF 변환 차단"

key-files:
  created:
    - card-news/scripts/build-slides.js
    - card-news/scripts/build-slides.test.mjs
    - card-news/scripts/templates-golden.test.mjs
    - card-news/fixtures/README.md
    - card-news/fixtures/.gitattributes
    - card-news/fixtures/snapshot-golden.json
    - card-news/fixtures/golden/2026-W24/** (HTML 14개)
  modified:
    - card-news/scripts/generate.js
    - card-news/scripts/fetch-data.js
    - card-news/scripts/templates.js   # +2 / -1 뿐

decisions:
  - "단일 원천은 slides[] 가 아니라 data — D-01 문자 그대로는 4필드 계약 하에서 구현 불가능"
  - "슬라이드 상한 5장 (D-07 재량)"
  - "big = item.price 원문 유지 — 재계산하면 반올림 하나로 HTML 과 갈라진다"
  - "publishedAt = 회차 종료일 23:59:59 KST (멱등·항상 과거·정렬 일치)"
  - "골든은 2026-08-03 HEAD 로 신규 생성 — output/ 아카이브 16개는 디자인 드리프트로 기준 부적합"

metrics:
  duration: "약 45분"
  completed: 2026-08-03
  tasks: 3
  commits: 3
---

# Phase 40 Plan 01: 카드뉴스 슬라이드 자료구조 추출 Summary

카드뉴스 슬라이드 문구를 `{kicker,big,label,sub}` 4필드 순수 자료구조로 끄집어내고,
전 18시리즈 렌더 HTML이 **바이트 단위로 1글자도 바뀌지 않았음**을 동결 스냅샷 기반 `diff -r` 로 실증했다.

---

## 🔴 SHA 기록 — 40-03 / 40-04 가 참조한다

| 이름 | SHA (40자 hex) | 의미 |
|---|---|---|
| `PHASE_BASE_SHA` | `0ec69aafc046780ad8281e3bf34775cf7b8acf84` | 40-01 착수 직전 |
| `TASK1_SHA` | `57e1b593b512c48cd32a82747f0d4d042fb39020` | Task 1 (하네스 + 골든). **BEFORE 렌더의 기준점** |
| `TASK2_SHA` | `480582f4c91094b4590f8d284e5e068f966f9457` | Task 2 (buildSlides 추출). AFTER 기준점 |
| `TASK3_SHA` | `eeafc55` | Task 3 (containment 4건) |

---

## 🔴 아카이브 16개는 회귀 기준으로 쓸 수 없다 (CONTEXT D-01 정정 확인)

40-CONTEXT D-01 **초안**은 *"`card-news/output/` 의 기존 HTML 16개를 기준으로 쓸 수 있다"* 고 썼다.
**이 전제는 틀렸다.** 플래너 실측이 옳았고, 실행 중 재확인했다.

데이터 비의존 완전 정적 함수인 `renderClosing` 조차 아카이브 4/4 와 불일치한다:

```
NEW: .card { … padding:100px; }      OLD: .card { … padding:80px; }
NEW: .h2   { font:900 88px/1.15 …    OLD: .h2   { font:900 76px/1.15 …
NEW: .btn  { padding:20px 44px; …    OLD: .btn  { padding:16px 36px; …
```

아카이브는 2026-06-24·06-29 산출물이고 그 뒤 `templates.js` 디자인이 **의도적으로** 바뀌었다.
문자 그대로 따랐다면 첫 대조에서 **오경보로 중단**됐을 것이다.

**대신 쓴 골든의 출처**: 2026-08-03 시점 `TASK1_SHA` 의 렌더 출력을 새로 생성해 커밋했다
(`card-news/fixtures/golden/`, HTML 14개). 스냅샷 기간은 `--from=2026-06-14 --to=2026-06-20`(`2026-W24`).

⛔ **"아카이브와 일치했다"고 쓰지 않는다.** 아카이브 16개는 판정에 쓰지 않았고, 삭제·수정·재생성도 하지 않았다.
실행 전후 `card-news/output/` 는 **98개 파일 / 집계 md5 `b0943efcb97960c28e9f057a14093531` 로 동일**하다.

> 📌 `card-news/output/` 는 `card-news/.gitignore` 의 `output/` 로 **git 미추적**이다
> (`git ls-files card-news/output` → 0건). 따라서 plan 의 acceptance
> `git status --porcelain card-news/output/` 빈 출력은 **원리적으로 항상 참이라 공허하다.**
> 그 대신 위 **파일 수 + 집계 md5 대조**를 실측 근거로 삼았다.

---

## 🔴 D-01 재해석 — "템플릿이 slides 를 렌더"는 4필드 계약 하에서 구현 불가능하다

D-01 은 `data → buildSlides(data) → slides[] → 템플릿이 렌더` 를 그렸다. 문자 그대로는 불가능하다:

| 근거 | 내용 |
|---|---|
| `renderRanking` | **10행**을 렌더한다. 4필드 슬라이드 1장이 10행을 담을 수 없다 |
| `renderHighlight` | 카드마다 `rank`·`name`·`price`·`sub` 를 **각각 다른 DOM 노드**로 렌더한다. 4필드에는 `name` 과 `sub` 를 분리해 담을 자리가 없다 |
| 확장 시 | 슬라이드 스키마를 4필드 밖으로 넓혀야 하는데 그건 **ADR-004 가 LOCK 한 뷰어 계약 위반** |

**채택한 해석 (D-07 재량):**

> **단일 원천은 `slides[]` 가 아니라 `data` 다.** `buildSlides(data)` 와 `render*(data)` 는
> **같은 `data` 를 받는 순수 함수 두 개**이고, 두 경로에 공통으로 나오는 문자열은
> **공유 헬퍼 `subLine` 하나**에서 만든다. *"HTML 과 DB 가 갈라지지 않는다"* 는 명제는
> **containment 테스트(케이스 18~21)** 가 기계적으로 강제한다.

이 해석이 D-01 의 **목적**(인스타 문구와 웹 문구가 갈라지는 것을 막는다)을 달성하면서
Success Criteria 2(HTML 무변경)를 깨지 않는 유일한 길이다.

🔴 **따라서 containment 테스트의 커버리지가 곧 보장 범위다.** 그래서 좁히지 않았다 —
골든 **4시리즈 전부** × **전 슬라이드** × **4필드 전부**. 예외는 아래 2건뿐이고 테스트 파일에 이유가 주석으로 있다:

1. `label === ''` (volume·value) — price 문자열에 이미 단위가 박혀 있다(`"7건"`, `"292만/평"`).
   **대신 `big` 통짜 대조가 단위를 함께 덮는다.**
2. `N위` 토큰 — `row-rank`·`badge-num` 은 **숫자만** 렌더한다(`위` 가 없다). 숫자 부분은 대조한다.

대조 대상 `H` = **그 시리즈 카드 전부를 이어붙인 문자열**(champions 는 2장). `02-highlight` 단독 대조 **0건** —
city 시리즈는 `item.subtitle` 이 `renderRanking` 의 `row-sub` 에만 렌더되므로 단독 대조가 구조적으로 실패한다.

**containment 이 공허하지 않음을 뮤테이션으로 확인했다:**
```
거래량   (현행 문구)        → true
거래건수 (갈라진 문구 시뮬) → false
7건      (big 원문)         → true
7 건     (재포맷 시뮬)      → false
```

---

## 전 18시리즈 무변경 실증 (Success Criteria 2)

**절차** — 라이브 DB 조회는 **1회**뿐이고, 그 동결 스냅샷으로 양쪽을 렌더했다.
데이터 드리프트와 코드 회귀가 섞이지 않는다.

```
① node scripts/generate.js --from=2026-06-14 --to=2026-06-20 --dump-data=$SNAP
     → 시리즈 18개 (기대 18 ✅), 27,797 bytes, [ERROR] 0건
② AFTER : node scripts/generate.js --data=$SNAP --dry-run --out=$SCRATCH/p40-after
③ BEFORE: git checkout $TASK1_SHA -- card-news/scripts  →  렌더  →  git checkout $TASK2_SHA -- card-news/scripts
④ diff -r $SCRATCH/p40-before $SCRATCH/p40-after
```

### ⛔ `git stash` 를 쓰지 않은 이유 (한 줄)

**태스크마다 커밋했으므로 이 시점 워킹트리가 깨끗하고, `git stash push -u` 는
*"No local changes to save"* 를 내고 아무것도 되돌리지 않는다 — BEFORE 가 AFTER 코드로 실행돼
`diff -r` 이 비고 무변경이 *거짓으로* 통과한다.** 그래서 SHA 기반 되돌리기를 썼다.
이 SUMMARY 에서 `git stash` 는 **사용 0건**이다 (금지 사유 서술로만 등장).

### BEFORE 되돌리기 양성 신호

| 신호 | 관측값 | 판정 |
|---|---|---|
| `git diff --stat --diff-filter=MD $TASK1_SHA -- card-news/scripts` | **빈 출력** | ✅ 실제로 되돌아갔다 |
| `git status --porcelain card-news/scripts` (복원 후) | **빈 출력** | ✅ 복원 완료 |

> 🔴 **plan 이 지정한 두 번째 신호 `grep -c "buildSlides" card-news/scripts/templates.js == 0` 은
> 판정력이 없다 — plan 의 결함이다.** `templates.js` 가 실제로 쓰는 심볼은 `subLine` 이고
> import 경로는 하이픈 표기 `'./build-slides.js'` 라서, **AFTER 상태에서도 `buildSlides` 는 0건**이다.
> 즉 이 신호는 BEFORE/AFTER 를 구분하지 못한다(둘 다 0). 관측값 자체는 plan 대로 **0** 이었다.
>
> **판정력 있는 신호로 대체해 실측했다**:
> | 상태 | `grep -c subLine templates.js` |
> |---|---|
> | BEFORE (되돌린 뒤) | **0** ✅ Task 2 가 실제로 빠졌다 |
> | AFTER (복원 뒤) | **2** ✅ import 1 + 사용 1 |

### ④ 판정 — 빈 디렉터리 오탐 차단 포함

| 항목 | 실측값 |
|---|---|
| `find $SCRATCH/p40-before -name '*.html' \| wc -l` | **70** |
| `find $SCRATCH/p40-after -name '*.html' \| wc -l` | **70** |
| 기대값 | 70 = `generateCardSet` 17시리즈 × 4장(68) + `district-champions` 2장 |
| `[ERROR] <series>:` 로그 | **0건** (양쪽 모두). 미대조 시리즈 없음 |
| `[skip] <series>:` 로그 | **0건** (스냅샷이 18시리즈 전부를 담았다) |
| `diff -r $SCRATCH/p40-before $SCRATCH/p40-after` | **빈 출력, exit code 0** |

→ **전 18시리즈에서 리팩터 전후 HTML 이 바이트 단위로 동일하다.**
`generate.js` 가 시리즈별 `try/catch` 로 실패해도 계속 진행하므로 빈 디렉터리끼리 통과하는
오탐이 가능한데, **양쪽 70개 동수**가 그것을 차단했다.

---

## 테스트 결과

### card-news 러너 4종 (수동 실행)

| 러너 | 변경 전 | 변경 후 | 판정 |
|---|---|---|---|
| `build-slides.test.mjs` | (신규) | **21 passed / 0 failed** | 17 단위 + 4 containment |
| `templates-golden.test.mjs` | (신규) | **14 passed / 0 failed** | 🔴 **HTML 무변경 증명** |
| `templates.test.mjs` | 14 passed / 0 failed | **14 passed / 0 failed** | 회귀 0 |
| `fetch-data.test.mjs` | 12 passed / 0 failed | **12 passed / 0 failed** | 회귀 0 |

### 루트 `npm run test` (vitest)

**회귀가 원리적으로 불가능함의 근거 (판정의 본체):**
```
git diff --stat $PHASE_BASE_SHA HEAD -- src/ supabase/ scripts/
→ 빈 출력
```
이 Phase 는 `src/`·`supabase/`·`scripts/` 를 **한 글자도 커밋하지 않았다.** 루트 vitest 는
`include: ['src/**/*.test.{ts,tsx}']` 라 대상 코드가 바이트 단위로 동일하다.
⛔ 총계 비교나 stash 기반 before/after 를 판정에 쓰지 않았다.

**현재 상태 1회 실측 (40-03 의 기준선):**

| 항목 | CONTEXT 베이스라인 | 실측 (2026-08-03) |
|---|---|---|
| Test Files | — | 6 failed / 98 passed (104) |
| Tests | 17 failed / 657 passed / 2 skipped (677) | **17 failed / 658 passed / 2 skipped (677)** |

> 📌 CONTEXT 베이스라인의 `657` 은 산술이 맞지 않는다(17+657+2 = 676 ≠ 677).
> 실측 `658` 이 총계 677 과 정합한다. **failed 17 은 일치**하므로 회귀 아님.
> CONTEXT 가 관측한 flaky 왕복(17↔18)은 이번 2회 실행에서 **둘 다 17** 이었다.

**실패 테스트 이름 집합 (17건) — 40-03 이 이 목록과 비교할 것:**
```
src/__tests__/complex-matching-3b.test.ts > matchByAdminCode (axis 3) > sgg_code 불일치 → null
src/__tests__/complex-matching-3b.test.ts > matchByAdminCode (axis 3) > sgg_code 일치 + 이름 유사 → complexA 반환, confidence ≤ 0.85
src/__tests__/complex-matching-3b.test.ts > matchByAdminCode (axis 3) > sgg_code 일치하나 이름 너무 다름 → null
src/__tests__/complex-matching-3b.test.ts > matchComplex (end-to-end) > 신뢰도 미달(no_match) → null + 큐에 no_match 기록
src/__tests__/favorites.test.ts > getFavorites > alert_enabled 업데이트 반영
src/__tests__/favorites.test.ts > getFavorites > insert 후 → 단지 1건 포함, canonical_name·alert_enabled 반환
src/__tests__/favorites.test.ts > isFavorited > 관심 단지 → true
src/__tests__/molit-ingest.test.ts > ingestMonth > ingest_run 생성 + 거래 3건 적재 + status=success
src/__tests__/molit-ingest.test.ts > ingestMonth > 동일 월 재ingest → rowsSkipped=3 (멱등성)
src/__tests__/molit-ingest.test.ts > upsertTransaction > 동일 dedupe_key 재upsert → "skipped" (멱등성)
src/__tests__/reviews.test.ts > getComplexReviews > 최신 순 정렬 (가장 최근이 첫 번째)
src/__tests__/reviews.test.ts > getComplexReviews > 후기 insert → id·content·rating·gps_verified 반환
src/__tests__/reviews.test.ts > getComplexReviewStats > 후기 있음 → count=2, avg_rating=4.5
src/__tests__/school-ranking-regional.test.ts > school_ranking RPC: 무구(無區) 시군구 처리 (integration) > 김해시 데이터에서 창원 5개 구 패턴에 매칭 안 되는 행은 gu=null로 정상 폴백된다
src/__tests__/seed-region.test.ts > step3: DB 시드 (integration) > regions: 경남 전체 22개 시군구 존재
src/__tests__/seed-region.test.ts > step3: DB 시드 (integration) > regions: 경남 확장 16개 시군구 gu=null
src/__tests__/seed-region.test.ts > step3: DB 시드 (integration) > regions: 부산 16개 구가 존재하고 모두 gu가 채워져 있다 (구 있는 광역시 패턴)
```
전부 **로컬 DB 의존 통합 테스트** (6파일). 이 plan 과 무관하다.

### lint

`npm run lint` → **exit 0** (`✔ No ESLint warnings or errors`)

---

## D-07 재량 결정 3건과 근거

| 결정 | 값 | 근거 |
|---|---|---|
| 슬라이드 상한 | **5장** | 랭킹은 10행이지만 뷰어 스와이프 피로도. `MAX_SLIDES` 상수로 노출해 조정 가능 |
| `big` 포맷 | **`item.price` 원문 유지** | 숫자를 재계산하면 **반올림 하나로** 렌더 HTML 과 갈라져 containment 가 깨진다. `volume`·`value` 는 단위가 문자열에 이미 박혀 있어 `label` 을 비웠다 |
| `publishedAt` | **`${to}T23:59:59+09:00`** | ① 재실행해도 안 바뀐다(멱등) ② 항상 과거라 `contents` 공개 읽기 정책 `published_at <= now()` 만족 ③ 아카이브 정렬이 회차 순서와 일치. `data.period`("06.14 ~ 06.20 신고 건")에는 **연도가 없어** 파싱 불가 → 호출부(40-03)가 `to` 를 넘긴다. HTML mtime 도 불가 — `2026-05` 회차에는 HTML 이 0개다 |

---

## `fetchDistrictChampions` 인자 통과의 무해함 근거 — **코드 검토**다

```js
// 변경 전: const { from, to } = getLastWeekRange()          // --from/--to 를 무시했다
// 변경 후: const { from, to } = fromArg ? { from: fromArg, to: toArg } : getLastWeekRange()
```

⚠️ **이 변경의 무해함은 골든이 증명하지 못한다.** 골든은 이 변경이 **들어간 뒤** 생성됐고,
Task 3 의 BEFORE 기준점(`TASK1_SHA`)도 이미 이 변경을 포함한다.

**무해함의 실제 근거는 코드 검토 한 줄이다**: 인자 없이 실행하면 `main()` 이
`getLastWeekRange()` 로 `{from,to}` 를 계산하고(`generate.js:132`) 그 값을 `...dateRange` 로 그대로 넘기므로,
`fetchDistrictChampions` 내부의 폴백과 **같은 값**이 된다. 다른 `fetch*` 4개가 이미 쓰는 관용구와 동일하다.

부수 효과: 40-04 의 소급 재생성에서 champions 가 더 이상 **현재 주** 데이터를 쓰지 않는다.

---

## Deviations from Plan

### 1. [Rule 2 - 누락된 필수 기능] `card-news/fixtures/.gitattributes` 추가

- **Found during:** Task 1, 골든 커밋 직전
- **Issue:** 이 저장소는 `core.autocrlf=true` 다(전역). 골든 HTML 은 node 가 쓴 **순수 LF**(CRLF 0건 확인)인데,
  `.gitattributes` 없이 커밋하면 **새 클론에서 체크아웃 시 LF→CRLF 로 변환**된다.
  그러면 `templates-golden.test.mjs` 가 코드 회귀가 없는데도 **14건 전부 실패**한다.
  이 plan 의 존재 이유인 "바이트 단위 무변경 게이트"가 다른 머신에서 조용히 무효가 되는 결함이다.
- **Fix:** `card-news/fixtures/.gitattributes` 에 `* -text` 선언. 이 디렉터리 아래 개행 변환 전면 금지.
- **검증:** `git check-attr text -- card-news/fixtures/golden/…/01-cover.html` → `text: unset` ✅
  `git add` 시 골든 파일에는 CRLF 경고가 **뜨지 않고** `scripts/*.js` 에만 뜬다 ✅
- **Files:** `card-news/fixtures/.gitattributes`
- **Commit:** `57e1b59`

### 2. [Rule 2 - 누락된 필수 기능] `buildChampionSlides` 가 `name === null` 행도 제외

- **Found during:** Task 2
- **Issue:** plan 의 `<behavior>` 는 *"`pricePerPyeong` 이 truthy 한 것만"* 이라고만 썼다.
  그런데 `fetchDistrictChampions` 는 `name: cmap.get(...)?.canonical_name ?? null` 이라
  **평당가는 있는데 단지 매칭이 실패해 `name` 이 null** 인 행이 나올 수 있다.
  그대로 두면 `sub: null` 이 되어 ① 뷰어 4필드 **문자열** 계약이 깨지고
  ② containment 의 `slide.sub.split()` 이 TypeError 로 터진다.
  (템플릿은 그 경우 `'데이터 없음'` 을 렌더하는데, 그 문자열이 웹 슬라이드로 나가는 것도 T-40-01-05 와 같은 사고다.)
- **Fix:** 필터를 `ch.pricePerPyeong && ch.name` 으로. 케이스 11 에 전용 단언 추가
  (ppp 9999 + name null → `[]`).
- **Files:** `card-news/scripts/build-slides.js`, `card-news/scripts/build-slides.test.mjs`
- **Commit:** `480582f`

### 3. [환경 적응] 임시 디렉터리 경로

- plan 은 `/tmp/p40-before` 등을 썼으나 **Windows** 환경이다. Git Bash 의 `/tmp` 와
  Node `path.resolve('/tmp/…')`(→ `C:\tmp\…`) 가 **서로 다른 위치**로 풀려 bash 의 `find` 와
  node 의 쓰기 경로가 어긋난다. 세션 스크래치패드 절대경로로 통일했다.
  판정 로직·기대값은 그대로다.

### 4. [plan 결함 — 판정력 없는 신호] `grep -c "buildSlides" templates.js`

- 위 「BEFORE 되돌리기 양성 신호」 절 참조. plan 이 지정한 값(**0**)은 관측됐으나
  AFTER 상태에서도 0 이라 **BEFORE/AFTER 를 구분하지 못한다.**
  판정력 있는 `grep -c subLine`(BEFORE 0 / AFTER 2)으로 대체 실측했다. 되돌리기 판정 결과 자체는 동일하다.

### 5. [범위 밖 — 손대지 않음] `supabase/.temp/cli-latest`

- 착수 **전부터** 미커밋 수정 상태였다(`v2.106.0` → `v2.110.0`, Supabase CLI 버전 캐시).
  이 plan 과 무관하므로 건드리지 않았고 커밋하지도 않았다.
- 그 결과 acceptance 의 `git diff --stat $PHASE_BASE_SHA -- src/ supabase/ scripts/` 는
  워킹트리 비교라 이 한 줄이 나온다. **커밋 기준**(`$PHASE_BASE_SHA HEAD`)으로는 **빈 출력**이고,
  그쪽이 "루트 테스트 대상 코드 무접촉"의 정확한 근거다.

---

## 이월 항목

1. **`renderHighlightPreview`(templates.js:503)에 `subLine` 미적용.**
   같은 식(`area ? \`${region} · 전용 ${area}\` : region`)이 인앱 미리보기 경로에 그대로 남아 있다.
   미리보기는 골든 대조 밖이라 **무변경을 실증할 수 없어** 이번에는 건드리지 않았다.
   0-6(리브랜딩) 때 미리보기 골든을 함께 만들면 그때 통합할 수 있다.
2. **card-news 테스트 4종은 루트 `npm run test` 에 잡히지 않는다.**
   `card-news/` 는 독립 npm 패키지(`type: module`, 자체 node_modules)이고 루트 vitest 는
   `include: ['src/**/*.test.{ts,tsx}']` 다. **수동 실행이 유일한 경로**이며,
   따라서 골든 게이트는 CI 에서 자동으로 돌지 않는다(T-40-01-07 = accept).
   CI 편입 여부는 사용자 판단 (Phase 39 선례와 동일 처리).
   ```
   node card-news/scripts/build-slides.test.mjs
   node card-news/scripts/templates-golden.test.mjs
   node card-news/scripts/templates.test.mjs
   node card-news/scripts/fetch-data.test.mjs
   ```
3. **`card-news/output/` 아카이브 16개는 디자인 드리프트 상태로 보존.** 재생성하지 않았다.
4. **0-6 리브랜딩은 골든을 의도적으로 깬다.** 골든을 지우거나 skip 하지 말고
   재생성한 뒤 `diff -r … | grep '^[<>]' | grep -v '창원부동산랩\|창부레터'` 가 비는지 확인할 것.
5. **`card-news/output/` 는 git 미추적**이므로 향후 plan 에서 `git status` 로 그 디렉터리의
   무접촉을 판정하지 말 것. 파일 수 + 집계 md5 를 쓸 것.

---

## Known Stubs

없음. `buildContentMeta` 는 40-03 이 호출할 때까지 **호출부가 없는 상태**이지만
스텁이 아니라 완성된 순수 함수이고, 단위 테스트 3건(14·15·16)이 계약을 고정하고 있다.

---

## Threat Flags

없음. 이 plan 은 네트워크 엔드포인트·인증 경로·스키마를 추가하지 않았다.
마이그레이션 **0건**, 신규 의존성 **0건**(`card-news/package.json` 무변경), `git push` **미실행**.

---

## Commits

| SHA | 메시지 |
|---|---|
| `57e1b59` | `feat(card-news): 렌더 재현 하네스(--out/--dump-data/--data) + 골든 회귀 픽스처` |
| `480582f` | `feat(card-news): 슬라이드 자료구조 추출 — buildSlides/buildChampionSlides + subLine 공유` |
| `eeafc55` | `test(card-news): 슬라이드 문구 ↔ 렌더 HTML containment 단언 4건 추가` |

`git status -sb` → `## main...origin/main [ahead 6]` — **push 하지 않았다** (의도적).
`git diff --diff-filter=D --name-only $PHASE_BASE_SHA HEAD` → 빈 출력 (파일 삭제 0건).

---

## Self-Check: PASSED

생성 파일 존재 확인 ✅ / 커밋 3건 존재 확인 ✅ / 골든 14건·단위 21건 통과 ✅ /
`diff -r` 빈 출력 + 양쪽 70개 ✅ / lint exit 0 ✅ / `card-news/output/` md5 불변 ✅
