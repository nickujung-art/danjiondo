# Phase 40: 창부레터 선행 조건 0-4·0-5 (+0-6) - Context

**Gathered:** 2026-07-31
**Status:** Ready for planning
**Source:** 창부레터 `docs/adr/ADR-004`·`ADR-005`(둘 다 LOCKED) + `docs/specs/SPEC-002` + 오케스트레이터 라이브 실측

> 이 Phase는 **다른 저장소(`C:\Users\jung\coding\changbuletter`)를 언블록하기 위한 bds 작업**이다.
> 창부레터는 문서 20개뿐이고 코드가 없다 — 부트스트랩 대기 상태다. 0-4·0-5가 끝나야
> 홈 히어로와 카드뉴스 뷰어에 붙일 데이터가 생긴다.
>
> **설계는 이미 확정돼 있다(ADR LOCKED). 즉석 재설계 금지.**

<domain>
## Phase Boundary

**선행 조건 진행 상황** (오케스트레이터가 프로덕션에서 직접 확인):

| # | 항목 | 상태 |
|---|---|---|
| 0-1 | `site_id` CHECK에 `changbuletter` | ✅ Phase 36 |
| 0-2 | `profiles.role`에 `cbl_editor` | ✅ Phase 36 |
| 0-3 | `contents` 외 4테이블 + RLS | ✅ Phase 36 (현재 0행) |
| **0-4** | **카드뉴스 슬라이드 → `contents` 저장** | ❌ **이 Phase** |
| **0-5** | **`rank_type='price_change'` + 배치** | ❌ **이 Phase** |
| 0-6 | 카드 템플릿 리브랜딩 + 비율 통일 | ❌ 이 Phase (마지막, 드롭 가능) |
| 0-7 | 배치 소유권 이전 검토 | 범위 밖 (블로킹 아님) |

**이 Phase가 하지 않는 일**:
- 창부레터 저장소 코드 작성 (부트스트랩은 별개)
- React 슬라이드 뷰어 구현 — 창부레터 소관 (ADR-004 §1)
- 0-7 배치 소유권 이전
- 9:16 템플릿 신설 — ADR-004가 **명시적으로 폐기**했다
- `card-templates.ts`의 인앱 빌더 기능 변경 (0-6은 비율·브랜드 문자열만)

</domain>

<decisions>
## Implementation Decisions

### D-01: 0-4 — 슬라이드 데이터를 **단일 원천**으로 만든다 🔑

**목표 형태** — 창부레터 뷰어가 읽는 계약. `design/cbl-article.jsx:43-61`이
`data.slides[i].kicker/big/label/sub` **정확히 4필드**를 렌더한다:

```jsonc
// contents.body  (type='card_news')
{ "slides": [ { "kicker": "이번 주 신고가 ▲", "big": "8억 9,000",
                "label": "만원", "sub": "중동 유니시티 4단지 · 84㎡" } ] }
```

🔴 **현재 파이프라인의 데이터 형태가 이것과 다르다.**
`card-news/scripts/generate.js:86` `generateCardSet(seriesId, data, dryRun)`의 `data`는
`{ weekCode, region, area, ranking[10], … }` 구조이고, 슬라이드 문구는
`templates.js`의 `renderCover`/`renderHighlight`/`renderRanking`/`renderClosing`
**HTML 문자열 안에 녹아 있다.** 즉 "슬라이드 텍스트"라는 자료구조가 존재하지 않는다.

**결정 — `buildSlides(data)`를 추출하고 템플릿이 그것을 렌더하게 한다.**

```
data ──> buildSlides(data) ──> slides[]  ──┬──> templates.js 가 렌더 (PNG/HTML)
                                            └──> contents.body 로 저장
```

**왜 이 방향인가**: 슬라이드 문구를 별도로 한 벌 더 만들면 **HTML과 DB가 반드시
갈라진다**. 인스타에 나간 문구와 웹 뷰어 문구가 다른 상태는 발행물 신뢰를 깬다.
단일 원천으로 두면 구조적으로 불가능해진다.

🔴 **최대 리스크 = 기존 PNG 출력이 바뀌는 것.** 템플릿을 건드리므로 회귀 가능성이 있다.
   **반드시 리팩터 전/후의 HTML 산출물을 대조**해 무변경을 실증할 것.
   (`--dry-run`이 HTML만 쓴다 — `generate.js:103`.)

   > 🔴 **정정 (2026-07-31, 플래닝 중 실측)** — 초안은 *"`card-news/output/`의 기존 HTML 16개를
   > 기준으로 쓸 수 있다"* 고 썼으나 **틀렸다.** 데이터 비의존 정적 함수 `renderClosing` 조차
   > 아카이브 4/4와 불일치한다(`padding:80px→100px`, `.h2 76px→88px` 등). 아카이브는
   > 2026-06-24·06-29 산출물이고 그 뒤 디자인이 **의도적으로** 바뀌었다.
   > 문자 그대로 따르면 첫 대조에서 **오경보로 중단**된다.
   >
   > **대체**: 리팩터 **직전** HEAD의 출력을 골든으로 새로 만들어 커밋하고, 그것과 대조한다.
   > 아카이브 16개는 참고 자료로만 두고 판정에 쓰지 않는다(삭제·수정도 하지 않는다).
   > 데이터 드리프트와 코드 회귀를 가르기 위해 `--dump-data` 스냅샷 1개로 양쪽을 렌더한다.

   차이가 나면 그 자체가 중단 사유다.

### D-02: 0-4 — 소급 적재는 **재생성 방식**, 3회차뿐임을 명시

**실측**: `card-news/output/`에 **3개 기간**만 있다 — `2026-05`, `2026-W24`, `2026-W25`
(PNG 82 + HTML 16). Supabase `cardnews-payloads` 버킷은 **0개**, `card-news` 버킷은 8개.

기획안(SPEC-002 0-4)은 *"과거 슬라이드 텍스트가 남아있지 않다면 론칭을 미뤄야 한다"* 고
경고했다. **텍스트는 HTML에 남아 있다** (실측 확인: `01-cover.html`에
`창원부동산랩` / `WEEKLY REPORT · 2026년 6월 2주차` / `창원 진해구` 등).

**결정**: HTML을 **파싱하지 않는다.** 대신 `generate.js`를 해당 기간 인자로 **재실행**해
`buildSlides()` 결과를 얻고 그것을 적재한다. HTML 파싱은 템플릿 마크업에 결합돼 깨지기 쉽다.

⚠️ **재실행은 현재 `transactions` 기준이라 과거 발행 시점과 값이 다를 수 있다**
(취소·정정 반영). 아카이브 용도로는 허용하되, **그 사실을 SUMMARY에 명시**할 것.
값이 크게 다르면 소급 적재를 포기하고 "0-4 이후 발행분부터"로 가는 것도 유효한 선택이다 —
**판단 근거를 남길 것.**

📌 **아카이브는 어차피 3건에서 시작한다.** 론칭 연기는 피했지만 "아카이브가 얇다"는
사실은 그대로다. 이건 0-4를 미룰수록 나빠지므로 지금 하는 게 맞다.

🔴 **소급 재실행에는 반드시 `--series` 를 준다 (2026-07-31 추가).**
`generate.js main()`은 `--series` 가 없으면 18시리즈 전부를 돈다. 그런데 회차별 실제 발행
시리즈 수는 **1 / 18 / 1 (합계 20)** 이다. `--series` 없이 3회 돌리면 54행이
`status='published'` 로 적재되고 **34행이 발행된 적 없는 허위 아카이브**가 된다.
`ls -1 card-news/output/<period>/` 로 목록을 도출하고, 적재 후
**회차별 행 수 ≤ 디렉터리 수**를 단언할 것. `total === distinct_slug` 나 "기간 그룹 3개"로는
**잡히지 않는다.**

### D-03: 0-4 — `contents` 적재 규칙

- `site_id='changbuletter'`, `type='card_news'`, `status='published'`
- `slug`: 기존 출력 디렉터리 규칙과 맞춘다 (`weekCode`/`seriesId` 기반, 예 `2026-w24-59-jinhae`).
  **재실행 시 중복 적재가 나면 안 된다** — `contents`의 유일성 제약을 확인하고
  멱등하게 만들 것. 🔴 **Phase 39의 교훈**: `onConflict`를 쓸 거면 **비부분 UNIQUE 인덱스가
  실제로 있는지 먼저 확인**하라. 부분 인덱스면 추론이 원리적으로 불가능하다.
  ✅ **실측 완료**: `contents_slug_key {slug}` 는 **비부분**이다 → `onConflict:'slug'` 추론 가능.
  그래도 검증 2층을 돌린다 — ① `npx supabase db query --linked "explain insert … on conflict (slug) do nothing"`
  ② `npx tsx --env-file=.env.local scripts/verify-onconflict-probe.ts --only=contents`
  (`contents` 는 FK가 없으므로 프로브 payload에서 `title`(NOT NULL, default 없음)을 빼
  23502로 막는다 — 행이 남지 않는다)
- 쓰기 주체는 **service_role**(스탠드얼론 스크립트). `contents`의 RLS 쓰기 정책은
  `service_role` / `cbl_editor`만 허용한다 (Phase 36, ADR-003)
- `published_at`은 해당 회차 발행 시점을 쓴다 (재실행 시각이 아니다)

### D-04: 0-5 — `price_change`는 **기존 랭킹 크론**에 추가한다

ADR-005는 *"bds `molit-daily`가 타임아웃 이력이 있으니 같은 배치에 얹지 말고 별도 스텝으로
분리하라"* 고 경고했다. **이미 분리돼 있다.**

> 🔴 **정정 (2026-07-31, 플래닝 중 재실측)** — 아래 표는 **초안이 틀렸던 것을 고친 것**이다.
> 초안은 `/api/cron/rankings` 가 `vercel.json` 에서 `30 19 * * *` 로 돈다고 썼으나 **사실이 아니다.**

| 크론 | 정의 위치 | 스케줄(UTC) | 내용 |
|---|---|---|---|
| `/api/cron/daily` | `vercel.json` | `0 19 * * *` (1일 1회) | 실거래·분양·청약·갭통계·K-apt |
| `/api/cron/cafe-articles` | `vercel.json` | `30 19 * * *` | 카페 글 수집 ← **초안이 rankings로 오인한 항목** |
| `/api/cron/rankings` | 🔴 `.github/workflows/rankings-cron.yml` | **`0 * * * *` — 매시 정각, 하루 24회** | `computeRankings()` |

`rankings-cron.yml` 세부: `timeout-minutes: 3`, `curl -sSf`(비200이면 job 실패).
`src/app/api/cron/rankings/route.ts` 는 `runtime='nodejs'` 이고 **`maxDuration` 선언이 없다**.

→ **`computeRankings`에 aggregator 하나를 추가하면 ADR-005의 요구가 자동 충족된다** (결론 유지).
`daily`에 얹지 말 것.

🔴 **다만 비용 분석이 달라진다**: 새 aggregator는 **하루 1회가 아니라 24회** 돈다.
SC9의 판정 기준은 "야간 배치 창"이 아니라 **① Vercel 함수 타임아웃 ② GH Actions `timeout-minutes: 3`** 이다.
⛔ **"04:30 KST 배치" 류 표현을 쓰지 말 것 — `rankings`에 그런 배치는 없다.**
`ingest_runs`(`source_id='rankings'`)에 **현재 4종 기준 프로덕션 소요시간이 이미 기록돼 있다** —
그것이 SC9의 진짜 BEFORE다.

구현 지점 (`src/lib/data/rankings.ts`):
- `aggregators` 배열(`:220-226`)에 `{ type: 'price_change', fn: aggregatePriceChange }` 추가
- `RankType` 유니온에 `'price_change'` 추가
- 마이그레이션: `complex_rankings_rank_type_check`를 DROP→ADD 해
  `'price_change'` 포함 (현재 `high_price`·`volume`·`price_per_pyeong`·`interest` 4종)

**계산 규칙**:
- `WINDOW_DAYS = 30` 유지 — 기존 4종과 같은 창을 쓴다. `complex_rankings`의 UNIQUE가
  `(rank_type, complex_id, window_days)`라 창을 섞으면 의미가 흐려진다
- 🔴 **`cancel_date IS NULL AND superseded_by IS NULL` 필수** (ADR-003·CLAUDE.md).
  누락하면 취소·정정 거래가 등락률에 들어간다
- `complexes.price_change_30d` 컬럼을 **쓰지 않는다** — ADR-005가 확인했듯 그건
  `refresh_complex_price_stats()`가 채우는 30일 롤링 컬럼이고, 랭킹 배치는
  `transactions` 기반으로 독립 계산한다(ADR-005 §1-2)
- 실시간 RPC 집계 **금지** — ADR-005가 명시적으로 기각했다(PostgREST 8초 제한)

### D-05: 0-5 — `hotArea`는 **MVP 근사**로 확정한다

ADR-005 §2가 *"어느 쪽으로 갈지는 부트스트랩 시점에 확정 (미결)"* 로 남겼다.
**이 Phase에서 확정한다**: **"등락률 1위 단지의 지역명"** 근사를 쓴다.

근거: `complex_rankings`는 단지 단위라 지역 집계를 만들 수 없고, 지역 단위 주간 집계를
별도로 산출하는 건 새 테이블·새 배치가 필요해 0-5의 범위를 크게 넘는다. 홈 히어로의
`hotArea`는 지표 1개이고, 근사로도 "이번 주 뜨거운 동네"라는 의미를 전달한다.

→ `price_change` 1위 행의 `metadata`에 지역명을 담아 창부레터가 바로 쓰게 한다.
`metadata` 컬럼은 이미 존재하고 다른 aggregator도 쓰고 있다(`rankings.ts:243`).

⚠️ 이건 **근사임을 창부레터 쪽에 알려야 한다** — SUMMARY에 명시하고,
`changbuletter/docs/adr/ADR-005`의 "미결" 표기를 갱신할지는 사용자 판단으로 남긴다
(크로스 레포 쓰기는 이 Phase 범위 밖).

### D-06: 0-6 — 마지막 웨이브, 드롭 가능

ADR-004 §3·§4:
- `src/lib/cardnews/card-templates.ts`: **1080 → 1350** (`html,body` + 각 `.card`, **총 6곳**)
- 리브랜딩: ADR-004가 안 것은 `card-templates.ts:47`·`:359` **2곳**이지만
  🔴 **플래너 전수 grep 실측은 8곳**이다:
  `card-templates.ts` 47·359 / `templates.js` 90·98·396·613 /
  `generate.js:141`(로그) / `card-news/package.json:4`(description).
  (`.next/` 빌드 산출물 2건은 재빌드로 갱신 — 손대지 않는다.)
- 🔴 **착수 전 다시 전수 grep할 것** — ADR이 "잔존 위치가 더 있을 수 있다"고 명시했고,
  1차 감사가 실제로 두 번째 코드베이스를 통째로 놓쳤다. 위 8곳도 착수 시점에 재확인한다
- 🔴 `card-templates.ts` 의 `1080` 은 **줄마다 2회**(width·height) 나온다. **height만** 1350으로
  바꾼다. `sed 's/1080/1350/g'` 를 쓰면 카드가 1350×1350 정사각형이 된다 — 금지
- 🔴 리브랜딩은 골든 HTML을 **의도적으로 깬다**. 골든을 지우거나 skip하지 말고
  **재생성한 뒤 `diff -r … | grep '^[<>]' | grep -v '창원부동산랩|창부레터'` 가 비는지** 확인한다
- 9:16 템플릿은 **만들지 않는다**

개발 블로킹이 아니므로 0-4·0-5가 위태로우면 **잘라내고 별도 Phase로 미뤄도 된다.**

### D-07: Claude's Discretion

- `buildSlides()`의 위치·시그니처, 슬라이드 개수(현재 4장 고정)
- `contents.slug` 정확한 포맷
- `aggregatePriceChange`의 최소 거래 건수 임계값 (희박 단지 제외 — `compute_gap_stats`의
  `>= 3` 선례 참고)
- 소급 적재를 스크립트로 만들지 일회성으로 돌릴지

</decisions>

<baseline>
## 실행 전 기준값 (오케스트레이터 실측, 2026-07-31)

| 항목 | 값 |
|---|---|
| `contents` 행 수 | **0** |
| `complex_rankings` rank_type | `high_price` 198 / `volume` 291 / `price_per_pyeong` 201 / `interest` 1 |
| `complex_rankings_rank_type_check` | 4종만 허용 — `price_change` **없음** |
| `card-news/output/` | 3기간, PNG 82 + HTML 16 — 🔴 **회차별 발행 시리즈 수가 다르다**: `2026-05`=**1**(`city-overall`) / `2026-W24`=**18** / `2026-W25`=**1**(`city-overall`). **합계 20** |
| `cardnews-payloads` 버킷 | **0개** |
| `card-news` 버킷 | 8개 (2026-06-29) |
| `from('contents')` 사용처 | `scripts/verify-cbl-rls.ts` **뿐** (Phase 36 검증용) |
| 크론 분리 | ✅ 분리됨. 🔴 **단 `rankings`는 `vercel.json`이 아니라 `.github/workflows/rankings-cron.yml`의 `0 * * * *`(매시)** — D-04의 정정 표 참조 |
| `contents` UNIQUE | `contents_slug_key {slug}` **비부분** (RPC 실측) → `onConflict:'slug'` 추론 가능 |
| `WINDOW_DAYS` | 30 (`rankings.ts:7`) |
| `superseded_by` in `rankings.ts` | **3회** (`aggregateInterest`는 `favorites` 조회라 없음) |
| `MIN_SITES` (onconflict 게이트) | **16** (`onconflict-audit.test.ts:266`). 단위 테스트 **20건** |
| onconflict 스캐너 범위 | 🔴 `.ts`/`.tsx` **만**, 루트 `src/` **만** → `card-news/scripts/*.js` **미포함** |
| `card-news/output/` 아카이브 HTML | 🔴 **디자인 드리프트됨** — `renderClosing`(정적 함수)조차 4/4 불일치. **회귀 기준으로 쓸 수 없다** |
| 테스트 베이스라인 | **17 failed / 657 passed / 2 skipped (677)** — 사전 실패 6파일(로컬 DB 의존) |
| `npm run lint` | exit 0 |
| `migration list --linked` | 0/0 |

> 🔴 **회귀 판정은 총계 비교로 하지 마라.** 사전 실패가 17건 있고 그중 일부는 flaky다
> (17↔18 왕복 관측됨). 베이스라인을 실측하고 **실패 테스트 이름 집합**을 비교할 것
> (`.planning/fix-loop/error-notes.md` #001).
>
> 🔴🔴 **단 `git stash`는 이 Phase에서 쓸 수 없다.** #001의 기법은 변경이 **미커밋**일 때만
> 유효하다. 이 Phase는 태스크마다 커밋하므로 `git stash push -u` 가
> *"No local changes to save"* 를 내고 **아무것도 되돌리지 않는다** → BEFORE가 AFTER 코드로
> 실행되고, `git status --porcelain` 이 비는 것을 *성공 신호*로 읽으면 **무변경·무회귀가
> 거짓으로 통과**한다. 조용히 통과하는 유일한 실패 모드다.
>
> **대체 절차**: 태스크마다 커밋 SHA를 기록하고
> `git checkout <SHA> -- <paths>` 로 되돌린다. 성공 신호는 `git status` 공백이 아니라
> **`git diff --stat <SHA> -- <paths>` 공백 + 신규 심볼 `grep -c` == 0** 두 양성 신호다.
> 신규 파일은 checkout이 지우지 않으므로 필요하면 `mv` 로 격리한다.

</baseline>

<scope_fence>
## Scope Fence

1. **기존 PNG/HTML 출력을 바꾸지 마라.** 0-4는 데이터 추출이지 디자인 변경이 아니다.
   리팩터 전후 HTML 대조로 실증할 것 — 차이가 나면 중단
2. **9:16 템플릿 신설 금지** — ADR-004가 폐기 결정했다
3. **`daily` 크론에 등락률을 얹지 마라** (D-04). `rankings` 크론에 넣는다
4. **실시간 RPC 집계 금지** — ADR-005 기각 결정
5. **`cancel_date IS NULL AND superseded_by IS NULL` 필수** — 모든 `transactions` 조회
6. **`complexes.price_change_30d`를 등락률 랭킹의 원천으로 쓰지 마라** (30일 롤링 컬럼이고
   소유 배치가 다르다)
7. 마이그레이션은 `supabase/migrations/` + `npm run db:push`. `execute_sql`·MCP
   `apply_migration`·대시보드 **금지** (Phase 37이 청소한 drift의 원인)
8. **`onConflict`를 새로 쓰면 비부분 UNIQUE 존재를 먼저 검증하라** — Phase 39의 고장 4건이
   전부 이 누락이었다. 검증 2층: ① `npx supabase db query --linked "explain insert … on conflict … do nothing"`
   ② `npx tsx --env-file=.env.local scripts/verify-onconflict-probe.ts --only=<table>` (PostgREST 경로,
   raw EXPLAIN보다 강한 증거 — Phase 39 산출물).
   ⛔ `supabase-js` 로는 raw SQL을 실행할 수 없고, `npx tsx -e "require(...)"` 는 ESM이라 동작하지 않는다.
   🔴 `src/lib/db/onconflict-audit.ts` 게이트는 **`.ts`/`.tsx` 만, 루트 `src/` 만** 스캔한다 —
   `card-news/scripts/*.js` 에 새 upsert를 쓰면 **게이트가 공허하게 통과**한다. 먼저 확장할 것
9. **창부레터 저장소에 쓰지 마라** — 이 Phase는 bds 작업이다
10. 정상 동작 중인 4개 aggregator를 건드리지 마라

</scope_fence>

## Success Criteria

1. `buildSlides(data)`가 존재하고, **템플릿과 DB 적재가 같은 원천**을 쓴다
2. **리팩터 전후 HTML 산출물이 동일**함이 대조로 실증됨 (기존 `output/` 16개 기준)
3. `contents`에 `type='card_news'`·`site_id='changbuletter'` 행이 생기고
   `body.slides[*]`가 `kicker`·`big`·`label`·`sub` 4필드를 갖는다
4. 같은 회차를 두 번 적재해도 중복 행이 생기지 않는다 (멱등)
5. 소급 적재 3회차가 반영됐거나, **미반영 사유가 근거와 함께 SUMMARY에 기록**됨
6. `complex_rankings_rank_type_check`가 `price_change`를 허용하고, 배치 실행 후
   `rank_type='price_change'` 행이 존재한다
7. 등락률 계산이 `cancel_date IS NULL AND superseded_by IS NULL`을 적용한다 (코드+테스트)
8. `price_change` 1위 행의 `metadata`에 지역명이 담긴다 (`hotArea` 근사)
9. `rankings` 크론 실행 시간이 유의미하게 늘지 않음 — 측정값을 SUMMARY에 남길 것
10. (0-6 수행 시) `card-templates.ts`가 1350이고 두 파일에 `창원부동산랩` 잔존 0건
11. `npm run lint` exit 0 / 테스트 회귀 0건 (이름 집합 기준) / `migration list --linked` 0/0

## Risk Summary

| 위험 | 완화 |
|------|------|
| 🔴 템플릿 리팩터가 PNG 출력을 바꾼다 | 기존 HTML 16개와 전후 대조. 차이 = 즉시 중단 (Success Criteria 2) |
| 소급 재실행 값이 과거 발행 시점과 다름 | 취소·정정 반영 때문. 아카이브 용도로 허용하되 SUMMARY에 명시. 차이가 크면 포기도 유효 |
| 새 `onConflict`가 또 제약 불일치 | Phase 39 게이트 + `EXPLAIN INSERT` 사전 검증 (Scope Fence 8) |
| 등락률 배치가 랭킹 크론을 느리게 함 | 실행 시간 측정 필수(SC9). `daily`와 분리돼 있어 실거래 수집엔 영향 없음 |
| `hotArea` 근사가 나중에 본안으로 교체 필요 | 근사임을 SUMMARY에 명시. `metadata`에 담아 교체 시 창부레터 코드 변경 최소화 |
| 아카이브가 3건뿐이라 론칭 임팩트 약함 | 사실이다. 숨기지 말고 사용자에게 보고 — 발행을 늘릴지는 사용자 판단 |
