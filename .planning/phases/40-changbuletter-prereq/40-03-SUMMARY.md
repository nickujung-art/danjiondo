---
phase: 40-changbuletter-prereq
plan: 03
subsystem: card-news + db-audit
tags: [card-news, changbuletter, contents, onconflict-gate, prereq-0-4]

requires:
  - "40-01 — buildSlides / buildChampionSlides / buildContentMeta"
  - "Phase 36 — public.contents 스키마 + RLS (이 plan 은 마이그레이션 0건)"
  - "Phase 39 — onConflict 감사 모듈 + unique_indexes_for_table RPC"
provides:
  - "AUDIT_ROOTS 상수 + collectAllUpsertSites(repoRoot) — 감사 스캔 루트 단일 원천"
  - "onConflict 정적 수집기가 .js/.mjs/.cjs 를 본다 (기존 .ts/.tsx 에 추가)"
  - "card-news/scripts/persist-contents.js — buildContentRow(순수) + persistContents(client 주입)"
  - "generate.js --persist (opt-in) — 슬라이드를 public.contents 에 적재"
  - "verify-onconflict-probe.ts 에 contents 타깃 (no:3)"
affects:
  - "40-04 (소급 3회차 + weekly-generate.yml 에 --persist 배선) — 이 plan 은 최근 1회차만 적재"
  - "창부레터 홈 히어로 / 콘텐츠 상세 — contents 가 0행에서 1행이 됐다"
  - "앞으로의 모든 upsert — scripts/·card-news/scripts/ 도 게이트 감사 대상이다"

tech-stack:
  added: []          # 신규 의존성 0건. package.json 2개 모두 무변경
  patterns:
    - "스캔 루트를 상수 1개(AUDIT_ROOTS)에 모아 '한 군데만 고침' 실패 모드 차단"
    - "게이트 확장은 양성 단언으로 검증 — '0건' 단언은 확장자 통째 스킵도 통과시킨다"
    - "클라이언트 주입(persistContents(client, rows)) → DB 없는 단위 테스트 가능"
    - "SHA 되돌리기 회귀 측정 (git stash 금지 — 커밋 뒤라 no-op)"

key-files:
  created:
    - card-news/scripts/persist-contents.js
    - card-news/scripts/persist-contents.test.mjs
  modified:
    - src/lib/db/onconflict-audit.ts
    - src/lib/db/onconflict-audit.test.ts
    - src/__tests__/onconflict-constraint-gate.test.ts
    - card-news/scripts/generate.js
    - scripts/verify-onconflict-probe.ts

decisions:
  - "region_tags 는 [] 로 비워두고 이월 — 시리즈의 region('창원 성산구')과 ADR-002 태그 단위('의창구')가 다르다"
  - "SKIP_FILES 에 scripts/verify-onconflict-probe.ts 추가 — 감사 도구 자신이라 영구 오탐원이다"
  - "--persist 는 opt-in — 기본값이 on 이면 --dry-run 실험이 전부 published 로 쓰인다"
  - "라이브 게이트가 통과 시에도 감사 표를 출력 — 초록불과 '0건 수집한 공허한 통과'를 구분하려면 표가 필요하다"

metrics:
  duration: "약 40분"
  completed: 2026-08-03
  tasks: 2
  commits: 2
---

# Phase 40 Plan 03: contents 적재 + onConflict 게이트 확장 Summary

Phase 39 의 onConflict 감사 게이트를 `.js`/`.mjs` 와 `card-news/scripts`·`scripts` 루트까지
넓힌 뒤, 그 넓어진 게이트의 감사를 받는 첫 사이트로 `persist-contents.js` 를 추가해
카드뉴스 슬라이드를 `public.contents` 에 적재했다 — `contents` 0행 → 1행.

## 기준 SHA

| 이름 | SHA |
|---|---|
| **`PRE_40_03_SHA`** | **`c3b72f6c3ecaba1a5f97dd9d2d89f88e93a27b99`** (= `c3b72f6`, 40-02 완료 시점) |
| Task 1 커밋 | `85b6622` |
| Task 2 커밋 (`AFTER`) | `f6d39da` |

🔴 회귀 베이스라인으로 `PHASE_BASE_SHA`(`0ec69aa`) 를 쓰지 않았다. 그 사이에 40-02 가
`src/lib/data/rankings.ts` 수정 + `rankings-price-change.test.ts` **신규 추가**를 넣었기 때문에,
거기로 되돌리면 40-02 탓인 실패가 40-03 의 회귀로 오인된다.

⛔ `git push` 미실행. 미푸시 커밋 **13건**.

---

## 파일별 변경

### `src/lib/db/onconflict-audit.ts` (수정)
- `walk()` 확장자 필터: `/\.tsx?$/` → `/\.(tsx?|mjs|cjs|js)$/`, 제외 패턴도
  `/\.(test|spec)\.(tsx?|mjs|cjs|js)$/` 로 확장
- `SKIP_DIRS` 에 `output`·`fixtures` 추가 (card-news 발행 산출물·골든 HTML)
- **`SKIP_FILES`** 신설 — `scripts/verify-onconflict-probe.ts` 1건. 판정은 `process.cwd()`
  의존을 피하려고 **경로 접미사** 로 한다
- **`AUDIT_ROOTS = ['src', 'card-news/scripts', 'scripts']`** + `collectAllUpsertSites(repoRoot)` export
- `collectUpsertSites` 시그니처 무변경 (기존 20건이 그대로 통과)

### `src/lib/db/onconflict-audit.test.ts` (수정 — **추가만**, 삭제 0)
- 케이스 21~26 추가. `git diff` 기준 삭제된 `it(` 블록 **0개**, `it(` 총계 20 → 26
- 기존 `MIN_SITES = 16` 하한 무변경 (낮추지 않았다)

### `src/__tests__/onconflict-constraint-gate.test.ts` (수정)
- `SRC_DIR = resolve(__dirname,'..')` → `REPO_ROOT = resolve(__dirname,'../..')`,
  `collectUpsertSites(SRC_DIR)` → `collectAllUpsertSites(REPO_ROOT)`
- 타임아웃 60s → 120s (테이블 15종 → 28종)
- **통과 시에도 감사 표를 출력**한다 (아래 "라이브 게이트" 참조)
- `gateNotReadyReason`·`skipNote`·음성 대조는 **무변경**

### `card-news/scripts/persist-contents.js` (신규)
- `buildContentRow(seriesId, data, to)` — 순수 함수. 11키 행 또는 `null`
- `persistContents(client, rows)` — `client` 주입. `{upserted, skipped}`
- `getClient()` — `--persist` 일 때만 호출되는 지연 생성기

### `card-news/scripts/generate.js` (수정)
- `--persist` 플래그(opt-in) + 3개 루프에서 `persistRows.push(buildContentRow(...))`
- `--dump-data` 모드에서는 적재하지 않는다 (`persist && !dumpBucket`)
- `--persist` 를 `--series` 없이 쓰면 **경고를 찍는다** (T-40-03-11 방어를 코드에도 남김)
- 종료 시 `적재 N건 / 건너뜀 M건 (슬라이드 0장)` 출력

### `scripts/verify-onconflict-probe.ts` (수정)
- `PROBE_TARGETS` 에 `no:3 contents(slug)` 추가. `title`(NOT NULL, default 없음)을
  **일부러 빼서** 23502 로 실행 단계에서 막는다 (`contents` 에는 FK 컬럼이 없어 랜덤 UUID 기법 불가)

---

## 🔴 onConflict 검증 2층 — 둘 다 실행

### ① raw EXPLAIN (`npx supabase db query --linked`)

```
npx supabase db query --linked "explain insert into public.contents (site_id, slug, type, category, title, status) values ('changbuletter','zz-p40-explain-probe','card_news','주간실거래가','probe','draft') on conflict (slug) do nothing"
```
```
Insert on contents  (cost=0.00..0.02 rows=0 width=0)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: contents_slug_key
  ->  Result  (cost=0.00..0.02 rows=1 width=501)
```
→ **`Conflict Arbiter Indexes: contents_slug_key`**. `42P10` 아님. `EXPLAIN ANALYZE` 미사용.

### ② PostgREST 프로브 (`verify-onconflict-probe.ts`)

```
npx tsx --env-file=.env.local scripts/verify-onconflict-probe.ts --only=contents
```
```
🔗 연결 대상: https://auoravdadyzvuoxunogh.supabase.co
🎯 프로브 대상: 1건 (--only=contents)

✅ [3] contents (slug) — 기대: OK / 실측: OK(23502)
      창부레터 0-4 — contents_slug_key(비부분 UNIQUE) 추론 확인
      ↳ null value in column "title" of relation "contents" violates not-null constraint

📊 결과: 1/1 PASS
| # | 대상 (onConflict) | 기대 | 실측 | 코드 | 판정 |
|---|---|---|---|---|---|
| 3 | `contents (slug)` | OK | OK | `23502` | ✅ |

🛡️  데이터 무변경: "에러 없음" 케이스 0건 (전 건 롤백)

✅ 최종 판정: PASS (1/1)
```
→ 23502 는 **실행** 단계 오류다. ON CONFLICT 추론(**플래닝** 단계)이 먼저 판정되므로
   42P10 이 아니라 23502 가 나왔다는 것은 추론이 성공했다는 뜻이다.

### ③ 프로브 잔여행 0건

```
npx supabase db query --linked "select count(*) from public.contents where slug like 'zz-p40-%'"
→ { "probe_rows": 0 }
```

---

## 🔴 라이브 게이트 감사 표 (실행함 — "미검증" 아님)

```
TEST_SUPABASE_URL=<NEXT_PUBLIC_SUPABASE_URL> TEST_SUPABASE_SKEY=<SUPABASE_SERVICE_ROLE_KEY> \
  npx vitest run src/__tests__/onconflict-constraint-gate.test.ts
```

**Task 2 완료 후 (34건 / 28종, `verdict !== 'ok'` 0건):**

`persist-contents.js` 행이 **실재한다**:
```
[onconflict-gate] 감사 대상 34건 / 테이블 28종
| card-news/scripts/persist-contents.js:89 | contents | slug | ok | contents_slug_key |
```

**Task 1 직후 (persist-contents.js 생성 전, 33건 / 27종) 전문 — 전 건 `ok`:**

| file:line | table | onConflict | verdict | matched index |
|---|---|---|---|---|
| src/app/actions/kakao-channel-actions.ts:40 | kakao_channel_subscriptions | user_id | ok | kakao_channel_subscriptions_user_id_key |
| src/app/api/cron/daily/route.ts:151 | presale_transactions | area,deal_date,floor,listing_id | ok | presale_transactions_listing_id_deal_date_area_floor_key |
| src/app/api/cron/daily/route.ts:189 | new_listings | pblanc_no | ok | new_listings_pblanc_no_key |
| src/app/api/cron/daily/route.ts:228 | new_listings | pblanc_no | ok | new_listings_pblanc_no_key |
| src/app/api/cron/daily/route.ts:361 | facility_kapt | complex_id,data_month | ok | facility_kapt_complex_id_data_month_key |
| src/lib/actions/listing-price-actions.ts:75 | listing_prices | complex_id,recorded_date,source | ok | listing_prices_complex_date_source_idx |
| src/lib/actions/redevelopment-actions.ts:77 | redevelopment_projects | complex_id | ok | redevelopment_projects_complex_id_key |
| src/lib/auth/push-actions.ts:21 | push_subscriptions | endpoint | ok | push_subscriptions_endpoint_key |
| src/lib/auth/realtor-actions.ts:169 | realtor_assignments | complex_id,display_order | ok | realtor_assignments_complex_id_display_order_key |
| src/lib/auth/topic-actions.ts:21 | notification_topics | topic,user_id | ok | notification_topics_user_id_topic_key |
| src/lib/data/cafe-articles.ts:54 | cafe_articles | naver_article_id | ok | cafe_articles_naver_article_id_key |
| src/lib/data/cafe-posts.ts:75 | cafe_posts | url | ok | cafe_posts_url_key |
| src/lib/data/complex-matching.ts:281 | complex_aliases | alias_name,complex_id,source | ok | complex_aliases_complex_id_source_alias_name_key |
| src/lib/data/gap-stats.ts:100 | complex_gap_stats | complex_id | ok | complex_gap_stats_complex_id_key |
| src/lib/data/rankings.ts:418 | complex_rankings | complex_id,rank_type,window_days | ok | complex_rankings_rank_type_complex_id_window_days_key |
| src/lib/data/realprice.ts:64 | transactions | dedupe_key | ok | transactions_dedupe_key_key |
| scripts/collect-district-stats.ts:215 | district_stats | adm_cd,data_quarter,data_year | ok | district_stats_adm_cd_data_year_data_quarter_key |
| scripts/compute-predictions.ts:218 | complex_price_predictions | area_bucket,complex_id,predicted_month | ok | complex_price_predictions_complex_id_area_bucket_predicted__key |
| scripts/crawl-naver-area-types.ts:163 | complex_area_types | complex_id,naver_pyeong_no | ok | complex_area_types_complex_id_naver_pyeong_no_key |
| scripts/crawl-naver-listings.ts:284 | listing_prices | complex_id,recorded_date,source | ok | listing_prices_complex_date_source_idx |
| scripts/crawl-presale-news.ts:314 | presale_discoveries | name,region | ok | presale_discoveries_name_region_idx |
| scripts/embed-complexes.ts:191 | complex_embeddings | chunk_type,complex_id | ok | complex_embeddings_complex_id_chunk_type_key |
| scripts/enrich-officetel-bldrgst.ts:268 | facility_kapt | complex_id,data_month | ok | facility_kapt_complex_id_data_month_key |
| scripts/fetch-cheongyak.ts:41 | new_listings | pblanc_no | ok | new_listings_pblanc_no_key |
| scripts/fetch-hagwon-neis.ts:159 | hagwon_db | aca_asnum | ok | hagwon_db_aca_asnum_key |
| scripts/fetch-regional-unsold.ts:59 | regional_unsold | sgg_code,year_month | ok | regional_unsold_sgg_code_year_month_key |
| scripts/generate-regional-commentary.ts:381 | regional_commentary | area_bucket,period_start,period_type,sgg_code | ok | regional_commentary_unique |
| scripts/import-management-cost.ts:361 | management_cost_monthly | complex_id,year_month | ok | management_cost_monthly_complex_id_year_month_key |
| scripts/ingest-sgis.ts:144 | district_stats | adm_cd,data_quarter,data_year | ok | district_stats_adm_cd_data_year_data_quarter_key |
| scripts/kapt-facility-enrich.ts:177 | facility_kapt | complex_id,data_month | ok | facility_kapt_complex_id_data_month_key |
| scripts/seed.ts:66 | data_sources | id | ok | data_sources_pkey |
| scripts/seed.ts:77 | regions | sgg_code | ok | regions_pkey |
| scripts/update-regional-income.ts:174 | regional_income | region_code,year | ok | regional_income_region_code_year_key |

📌 **`scripts/` 루트 편입 실측 결과: 17건 전부 `ok`.** 플랜이 "실측으로 확인하고 SUMMARY 에
남긴다"고 한 부분이다 — 숨어 있던 Phase 39 형 결함은 **0건**이었다.

---

## 확장 전/후 `grep -rn "onConflict"`

**전 (Task 1 시작 시점)** — `card-news/scripts` **0건**, `scripts` 17건 + 프로브 파일:
```
grep -rn "onConflict" card-news/scripts scripts --include=*.js --include=*.mjs --include=*.ts | grep -v node_modules | grep -v '\.test\.'
scripts/collect-district-stats.ts:215 / compute-predictions.ts:218 / crawl-naver-area-types.ts:163
scripts/crawl-naver-listings.ts:284 / crawl-presale-news.ts:314 / embed-complexes.ts:191
scripts/enrich-officetel-bldrgst.ts:268 / fetch-cheongyak.ts:41 / fetch-hagwon-neis.ts:159
scripts/fetch-regional-unsold.ts:59 / generate-regional-commentary.ts:381 / import-management-cost.ts:361
scripts/ingest-sgis.ts:144 / kapt-facility-enrich.ts:177 / seed.ts:66 / seed.ts:77 / update-regional-income.ts:174
scripts/verify-onconflict-probe.ts:7,41,56,64,97,100,151   ← 감사 도구 자신 (SKIP_FILES 대상)
(card-news/scripts 는 0건)
```

**후** — `card-news/scripts` 에 1건 추가:
```
grep -rn "onConflict" card-news/scripts --include=*.js --include=*.mjs | grep -v '\.test\.'
card-news/scripts/persist-contents.js:8    * ## 🔴 onConflict: 'slug' 의 근거 (Phase 39 재발 방지)   ← 주석
card-news/scripts/persist-contents.js:10   * Phase 39 의 고장 4 건은 …                              ← 주석
card-news/scripts/persist-contents.js:89       .upsert(valid, { onConflict: 'slug', ignoreDuplicates: false })
```
🔴 주석 2건은 `stripComments()` 가 걸러서 수집되지 않는다 — 감사 표에도 `:89` 1건만 나온다.

---

## 🔴 케이스 26 — `truths[0]` 의 구속력 있는 증거

```ts
it('🔴 26. collectAllUpsertSites 가 card-news/scripts/persist-contents.js 의 contents upsert 를 수집한다', () => {
  const sites = collectAllUpsertSites(REPO_ROOT)
  const hit = sites.find((s) => s.file.endsWith('card-news/scripts/persist-contents.js'))
  expect(
    hit,
    `수집 목록:\n${sites.map((s) => `  ${s.file}:${s.line} ${s.table}`).join('\n')}`,
  ).toBeDefined()
  expect(hit?.table).toBe('contents')
  expect(hit?.columns).toEqual(['slug'])
})
```

이 케이스는 **DB 가 필요 없다.** 라이브 게이트가 CI 에서 영구 skip 되어도
`must_haves.truths[0]`("card-news/scripts 의 upsert 지점도 감사 범위에 들어온다")은 유지된다.
실물 파일을 지목하므로 `.js` 확장이 되돌려지면 **반드시 실패**한다.

케이스 21·22 도 같은 이유로 **양성 단언**이다 — "정확히 1건 + 테이블·컬럼 일치".
초안의 "`.js` 픽스처 0건" 단언은 `.js` 가 통째로 스킵돼도 통과하므로(T-40-03-12)
이 태스크가 고치려는 바로 그 버그를 인증했을 것이다.

---

## 🔴 `--series` 와 실적재 (허위 발행물 0건)

```
ls -1 card-news/output/2026-W25/
→ city-overall                       (디렉터리 1개)

SERIES=$(ls -1 card-news/output/2026-W25/ | paste -sd, -)
→ city-overall
```

```
node scripts/generate.js --from=2026-06-21 --to=2026-06-27 \
  --series="city-overall" --dry-run --persist --out=<scratch>/p40-persist
→ 적재 1건 / 건너뜀 0건 (슬라이드 0장)
```

`--series` 없이 돌렸다면 18시리즈가 적재돼 **17건이 허위 발행물**이 됐을 것이다 (T-40-03-11).
`total === distinct_slug` 검사로는 잡히지 않는 형태다.

### 적재된 행 (count = 1, slug 목록)

```sql
select count(*) as total, count(distinct slug) as distinct_slug from public.contents;
→ { "total": 1, "distinct_slug": 1 }

select count(*) as w25_rows from public.contents where slug like '2026-w25-%';
→ { "w25_rows": 1 }                       -- == 발행 시리즈 디렉터리 수 1

select slug, title, status, published_at, jsonb_array_length(body->'slides') as n_slides
from public.contents order by slug;
→ {
    "slug":         "2026-w25-city-overall",
    "title":        "2026년 6월 3주차 창원+김해 실거래가 랭킹 TOP 10",
    "status":       "published",
    "published_at": "2026-06-27 14:59:59+00",     -- = 2026-06-27T23:59:59+09:00
    "n_slides":     5
  }
```

**적재된 slug 전체 목록: `2026-w25-city-overall` (1건).**

### 🔴 `body->'slides'->0` — 정확히 4키 (SC3)

```sql
select jsonb_object_keys(body->'slides'->0) from public.contents order by slug limit 10;
→ big / sub / label / kicker          (4개. 그 이상도 이하도 없음)

select body->'slides'->0 from public.contents order by slug limit 1;
→ {
    "big":    "16억 3,000",
    "kicker": "1위 · 최고가",
    "label":  "만원",
    "sub":    "용지더샵레이크파크아파트 · 성산구"
  }
```

### 🔴 멱등 (SC4) — 2회 적재 전후 행 수

| 시점 | `total` | `distinct_slug` |
|---|---|---|
| 적재 전 | 0 | 0 |
| 1회차 적재 후 | **1** | **1** |
| 2회차 적재 후 (같은 명령, `--out` 만 다름) | **1** | **1** |

2회차도 `적재 1건 / 건너뜀 0건` 을 출력했고 행 수는 늘지 않았다.

### 🔴 `--persist` 없이는 DB 에 쓰지 않는다 (SC6)

| 실행 | `--persist` | 실행 후 `contents` 행 수 |
|---|---|---|
| 적재 전 baseline | 없음 | 0 → **0** (불변) |
| 적재 후 재확인 | 없음 | 1 → **1** (불변) |

`--persist` 없는 실행은 `적재 …건` 요약 줄 자체를 출력하지 않는다 (DB 접속 0회).

---

## 테스트 결과

| 스위트 | 결과 |
|---|---|
| `npx vitest run src/lib/db/onconflict-audit.test.ts` | **26 passed / 0 failed / 0 skipped** (기존 20 + 21~25 + 케이스 26) |
| `node card-news/scripts/persist-contents.test.mjs` | **12 passed / 0 failed** |
| `node card-news/scripts/build-slides.test.mjs` | **21 passed / 0 failed** (40-01 무변경) |
| `node card-news/scripts/templates-golden.test.mjs` | **14 passed / 0 failed** — 🔴 HTML 무변경 유지 |
| `node card-news/scripts/templates.test.mjs` | 14 passed / 0 failed |
| `npx vitest run src/__tests__/onconflict-constraint-gate.test.ts` (라이브) | **2 passed** — 34건 전부 `ok` |
| `npm run lint` | **exit 0** — `✔ No ESLint warnings or errors` |

`persist-contents.test.mjs` 12케이스에 플랜이 요구한 필수 항목이 전부 있다:
2(슬라이드 4키) · 3(0건 → `null`) · 9(`onConflict === 'slug'`) · 10(error → throw) · 12(멱등).

---

## 🔴 회귀 — SHA 되돌리기 (git stash 미사용)

`git stash` 를 쓰지 않은 이유: Task 1 이 이미 커밋을 남겼으므로 stash 는
*"No local changes to save"* 를 내고 **아무것도 되돌리지 않는다.** 그러면 BEFORE 가 AFTER
코드로 돌아 "불변" 이 측정 없이 나온다 (T-40-03-13).

```
BASE=c3b72f6c3ecaba1a5f97dd9d2d89f88e93a27b99   # PRE_40_03_SHA
AFTER=f6d39dacadc6dd4602db86bbcbccbeedb5c3f947

# 이 plan 이 src/ 에 신규 파일을 만들지 않았음을 먼저 확인 (checkout 은 신규 파일을 안 지운다)
git diff --stat --diff-filter=A $BASE $AFTER -- src/
→ (빈 출력)  ✅ 신규 0건, 수정 3건뿐

git diff --stat $BASE $AFTER -- src/
 src/__tests__/onconflict-constraint-gate.test.ts |  78 ++++++++-----
 src/lib/db/onconflict-audit.test.ts              | 130 +++++++++++++++++++++++
 src/lib/db/onconflict-audit.ts                   |  61 ++++++++++-
 3 files changed, 237 insertions(+), 32 deletions(-)

git checkout $BASE -- src/
git diff --stat --diff-filter=MD $BASE -- src/
→ (빈 출력)  ✅ 양성 신호 — 되돌아갔다
```

| | Test Files | Tests |
|---|---|---|
| **BEFORE** (`src/` @ `PRE_40_03_SHA`) | 6 failed / 99 passed (105) | **17 failed / 675 passed / 2 skipped (694)** |
| **AFTER** (`src/` @ `f6d39da`) | 6 failed / 99 passed (105) | **17 failed / 681 passed / 2 skipped (700)** |

- `failed` **17 → 17 불변**
- `passed` +6, 총계 +6 — 정확히 이 plan 이 추가한 6케이스(21~26)다
- 복원 확인: `git checkout $AFTER -- src/` 후 `git status --porcelain src/` → **빈 출력**

### 실패 **이름 집합** diff

```
diff /tmp/p40-03-before.txt /tmp/p40-03-after.txt && echo "FAILSET_UNCHANGED"
→ FAILSET_UNCHANGED
```

17건 전부 40-01-SUMMARY 의 기존 목록과 **문자열 단위로 일치**한다
(`complex-matching-3b` 4 · `favorites` 3 · `molit-ingest` 3 · `reviews` 3 ·
`school-ranking-regional` 1 · `seed-region` 3). 전부 로컬 DB 의존 통합 테스트다.

> ⚠️ **1차 AFTER 채집에서 리포터 형태 차이가 있었다.** `complex-matching-3b.test.ts` 가
> 개별 4건이 아니라 파일 단위 1줄(`FAIL … [ … ]`)로 출력돼 이름 집합 diff 가 비지 않았다.
> 총계(17/6)는 동일했다. 원인을 특정하려고 그 파일만 **BASE 2회 · AFTER 2회** 격리 실행한
> 결과 네 번 모두 `4 failed | 9 passed (13)` 에 **같은 4개 이름**이었다 — 즉 리포터 출력
> 형태의 흔들림이지 실패 대상의 변화가 아니다. 전체 스위트를 다시 돌려 받은 2차 채집에서
> `FAILSET_UNCHANGED` 가 나왔고, 위 표의 AFTER 수치는 그 재실행 값이다.

---

## D-07 재량 결정

**`region_tags: []` 로 비워두고 이월.**
시리즈 정의의 `region` 은 `'창원 성산구'`·`'창원+김해'` 형태인데 ADR-002 의 `region_tags` 는
`'의창구'`·`'중동'` 같은 **동/구 단위** 태그를 의도한다. SPEC-002 C절 "초기 태그 목록" 이
아직 미결이라, 잘못된 태그를 넣으면 창부레터 지역 추천(`&&` 교집합 인덱스)이 오작동한다.
빈 배열은 `not null default '{}'` 와 정합하고, 확정 후 UPDATE 로 채우는 편이 안전하다.

---

## 계획 대비 편차

### [Rule 3 - 차단 이슈] `scripts/verify-onconflict-probe.ts` 를 `SKIP_FILES` 로 제외

- **발견 시점:** Task 1, `scripts` 루트를 편입한 직후 실측
- **문제:** 그 파일의 `PROBE_TARGETS` 에 `onConflict: 'complex_id,data_month'`·`'complex_id'` 가
  **문자열 리터럴 데이터**로 들어 있다. 그런데 테이블은 `supabase.from(t.table)` — 변수라
  `FROM_RE`(문자열 리터럴만 매치)가 못 잡아 `table === ''` 가 된다. 결과:
  ① 케이스 24 의 `table === "" 0건` 단언이 깨진다
  ② 라이브 게이트가 `table_unknown` **영구 오탐** — 오탐 하나면 게이트 전체가 무시된다
  게다가 no:2 는 **일부러 깨진 값**(42P10 이 나와야 정상)이라 감사 대상이 되는 것 자체가 모순이다.
  Task 2 에서 `contents` 타깃을 추가하면 오탐이 3건으로 늘어난다.
- **수정:** `SKIP_FILES` 신설 + 해당 1건 등록. "게이트가 시끄러워서 늘리지 말 것" 경고를
  모듈 주석에 남겼다 — 이 목록이 커지면 T-39-03-02 가 그대로 재현된다.
- **파일:** `src/lib/db/onconflict-audit.ts`  **커밋:** `85b6622`

### [Rule 2 - 누락된 필수 기능] `--persist` + `--series` 누락 경고

- 플랜은 `--series` 를 **운영 절차**로만 규정했다(T-40-03-11). 절차는 잊힌다 —
  40-04 가 소급 3회차를 돌릴 때 실수 1회로 17건의 허위 발행물이 생긴다.
- `--persist && !--series` 이면 경고를 찍도록 `generate.js` 에 추가했다. (차단은 하지 않는다 —
  전 시리즈 적재가 정당한 회차가 있을 수 있고, 플랜이 동작 변경을 승인하지 않았다.)
- **파일:** `card-news/scripts/generate.js`  **커밋:** `f6d39da`

### [Rule 2] 라이브 게이트가 통과 시에도 감사 표를 출력

- 이 게이트는 **수동 실행 전용**이다(CI 에 자격증명 없음). 초록불만으로는
  "34건을 대조해 전부 통과" 와 "스캐너가 0건을 수집한 공허한 통과" 가 **구분되지 않는다** —
  Phase 39 위협등록부가 지목한 바로 그 실패 모드다. 표를 찍어야 증거가 남는다.
- **파일:** `src/__tests__/onconflict-constraint-gate.test.ts`  **커밋:** `85b6622`

### 계획된 케이스 수 배치 조정 (기능 차이 없음)

플랜의 케이스 23은 "주석 미수집" 만 규정했다. `.test.mjs`/`.spec.js` 제외가 새 확장자에도
적용되는지는 별도 단언이 필요했는데, 별도 `it(` 로 두면 총계가 25/26 이 아니라 26/27 이 되어
acceptance 의 숫자와 어긋난다. → **케이스 23 본문 안에 ②로 합쳤다.** 단언은 전부 존재하고
`it(` 총계는 플랜대로 26이다.

---

## 미검증 / 한계

1. **⛔ `grep -c "skipIf" src/lib/db/onconflict-audit.test.ts` == 0 은 미달 (== 1).**
   유일한 매치는 **Phase 39 가 써 둔 파일 상단 주석** `describe.skipIf 를 쓰지 않고 …` 이며,
   실제 `describe.skipIf(` 호출은 **0건**이다. 이 plan 이 만든 것이 아니고, 그 주석을 지우면
   규약 근거가 사라지므로 **그대로 뒀다.** 의도(=이 파일은 항상 전부 실행된다)는 충족한다 —
   실측 `26 passed / 0 skipped`.
2. **`git status --porcelain supabase/` 는 빈 출력이 아니다** — ` M supabase/.temp/cli-latest`.
   이 plan 시작 **전부터** 더러웠던 Supabase CLI 버전 캐시 파일이고 마이그레이션이 아니다.
   `git status --porcelain supabase/migrations/` 는 **빈 출력**이며 이 plan 의 마이그레이션은 **0건**이다.
3. **웹에서 실제로 보이는지는 확인하지 않았다.** RLS 정책
   (`status='published' and published_at <= now()`)과 값(`published`, 과거 시각)이 정합한다는
   것까지만 확인했다. anon 키로 실제 조회하거나 창부레터 화면을 띄워보지는 않았다.
4. **`district-champions` 경로의 실적재는 안 했다.** 2026-W25 에 그 시리즈가 발행되지 않아
   `--series` 대상이 아니었다. 단위 테스트 케이스 4로만 검증됐다.
5. 대량 적재(18시리즈 동시 upsert) 성능·부분 실패 거동은 측정하지 않았다. 1건만 적재했다.

---

## 이월 항목

1. **`region_tags` 미입력** — SPEC-002 C절 "초기 태그 목록" 미결. 확정 후 UPDATE 로 채운다.
2. **소급 3회차는 40-04 소관** — 이 plan 은 최근 1회차(`2026-W25`)만 적재했다.
   40-04 는 각 회차마다 `ls -1 output/<weekCode>/` 로 `--series` 를 도출해야 한다.
3. **주간 자동화(`weekly-generate.yml`)에 `--persist` 미적용** — 40-04 에서 한다.
   그때까지 새 회차는 **자동으로 적재되지 않는다.** 워크플로는 인자 없이 실행되므로
   지금 `--persist` 를 붙이면 18시리즈 전부가 발행물로 적재된다.
4. **🔴 라이브 대조 게이트는 CI 에서 영구 skip** — `.github/workflows/ci.yml` 의 unit-test 잡에
   `env:` 블록이 없어 `TEST_SUPABASE_SKEY` 가 주입되지 않는다 (Phase 39 와 동일 한계, T-40-03-10).
   자동 실행에서 단언되는 것은 **DB 불필요 26건뿐**이다. 그중 **케이스 26** 이 실물
   `persist-contents.js` 수집을 단언하므로 `truths[0]` 은 CI 에서도 유지된다.
5. **`card-news` 테스트 4종은 루트 `npm run test` 에 잡히지 않는다** (vitest `include: src/**`).
   `persist-contents` · `build-slides` · `templates-golden` · `templates` — 전부 수동 실행이다.
6. **`SKIP_FILES` 는 1건이어야 한다.** 늘어나면 게이트가 조용히 좁아진 것이다 — 리뷰 대상.

---

## Self-Check: PASSED

**파일 실재**
- `card-news/scripts/persist-contents.js` — FOUND
- `card-news/scripts/persist-contents.test.mjs` — FOUND
- `.planning/phases/40-changbuletter-prereq/40-03-SUMMARY.md` — FOUND

**커밋 실재**
- `85b6622` fix(db): onConflict 감사 범위를 card-news/scripts·scripts 까지 확장 — FOUND
- `f6d39da` feat(card-news): 슬라이드 데이터를 contents 로 적재 — FOUND

**작업 트리**
- `git status --porcelain card-news/output/` → 빈 출력 (과거 발행물 무변경, T-40-03-09)
- `git status --porcelain supabase/migrations/` → 빈 출력 (마이그레이션 0건)
- `git push` 미실행 — 미푸시 13건
