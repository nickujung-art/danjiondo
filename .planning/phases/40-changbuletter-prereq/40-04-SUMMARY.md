---
phase: 40-changbuletter-prereq
plan: 04
subsystem: card-news + contents 아카이브
tags: [card-news, changbuletter, contents, backfill, workflow, prereq-0-4]

requires:
  - "40-01 — buildSlides / buildChampionSlides / buildContentMeta"
  - "40-03 — persist-contents.js + generate.js --persist"
  - "Phase 36 — public.contents 스키마 + RLS (이 plan 은 마이그레이션 0건)"
provides:
  - "contents 20행 — 2026-05(1) / 2026-W24(18) / 2026-W25(1)"
  - ".github/workflows/weekly-generate.yml 에 --persist + --persist-series=city-overall 배선 (배포됨)"
  - "shouldPersistSeries() — 생성 범위(--series)와 적재 범위(--persist-series) 분리"
  - "card-news/.github/workflows/weekly-generate.yml 에 '실행되지 않음' 경고"
  - "재생성 값 ↔ 원본 발행분 차이의 정량 측정 + 원인 규명(지연 신고 100%)"
  - "price_change 지역 범위 실측(22행 중 부산 12) + 창부레터 읽기 필터 계약"
affects:
  - "창부레터 아카이브 — 20건에서 시작한다"
  - "주간 자동화 — push 후부터 city-overall 1건이 매주 자동 적재된다 (그 전까지는 아님)"
  - "창부레터 price_change 소비 — si 필터 없이 쓰면 hotArea 가 부산 동래구가 된다"

tech-stack:
  added: []          # 신규 의존성 0건
  patterns:
    - "소급 적재의 --series 를 ls -1 output/<period>/ 에서 도출 — 회차별 발행 시리즈 수가 불균일(1/18/1)"
    - "회차별 행 수 ≤ 디렉터리 수 단언 — total===distinct_slug 로는 허위 발행물이 안 잡힌다"
    - "값 차이의 원인을 created_at 으로 귀속 — '취소/정정/지연신고' 중 무엇인지 추측하지 않는다"
    - "gitignore 된 디렉터리에 git status 무접촉 검사를 쓰지 않는다 (공허하게 통과한다)"

key-files:
  created:
    - .planning/phases/40-changbuletter-prereq/40-04-SUMMARY.md
  modified:
    - .github/workflows/weekly-generate.yml
    - card-news/.github/workflows/weekly-generate.yml
    - card-news/scripts/generate.js
    - card-news/scripts/persist-contents.js
    - card-news/scripts/persist-contents.test.mjs

decisions:
  - "B-1 소급 유지 — 완전일치 5/16 이지만 차이가 100% 지연 신고로 귀속됐다(취소·정정 기여 0). 재생성 값은 오류 정정이 아니라 더 완전한 스냅숏"
  - "B-2 아카이브 20건으로 진행 — 늘리는 방법은 발행 빈도뿐, 소급으로는 불가"
  - "B-4 주간 크론 적재 범위를 city-overall 로 한정 — 생성(--series)과 적재(--persist-series)를 분리. 오늘이 월요일이라 배포 전 반영 필수였다"
  - "B-5 price_change 는 전국 유지, 창부레터가 읽을 때 si 필터 — 실거래이야기 재사용(ADR-005)을 위해"
  - "죽은 워크플로 사본은 삭제하지 않고 경고 주석만 추가 (D-07, 플랜 지시)"

metrics:
  duration: "약 90분"
  completed: 2026-08-03
  tasks: 3
  commits: 2
---

# Phase 40 Plan 04: 소급 적재 + 주간 자동화 배선 Summary

과거 3회차를 `contents` 에 소급 적재해 아카이브를 1행 → **20행**으로 만들고, 재생성 값이
원래 발행분과 얼마나 다른지 4개 시리즈에서 정량 측정했다. **완전일치율은 31.3%(5/16)**이며
차이의 원인은 전부 **지연 신고**로 규명됐다(취소 0건 / 정정 0건 기여). 주간 자동화에
`--persist` 를 배선해 커밋했으나 **배포하지 않았다.**

## 기준 SHA

| 이름 | SHA |
|---|---|
| `PHASE_BASE_SHA` | `0ec69aa` |
| `PRE_40_02_SHA` | `4e285a8` |
| `PRE_40_03_SHA` | `c3b72f6` |
| **Task 2 커밋** | **`59af356`** |

⛔ **실행자는 `git push` 를 하지 않았다.** 작업 중 **사용자가 직접 push** 했고 `origin/main` 은
`34b13ac` 로 이동했다 — 위 코드 커밋 2건(`59af356`·`3bbabb9`)은 **둘 다 배포된 상태**다 (B-3 참조).
`.planning/` 문서 커밋만 미푸시로 남는다.

🔴 **이 plan 이 만들지 않은 커밋이 실행 중에 1건 들어왔다.**
`45dd73e fix(molit): 실패율이 임계를 넘으면 exit 1 — 전부 실패해도 초록불이던 문제`
(author `nickujung-art`, 2026-08-03 13:53:30 +0900, `scripts/backfill-realprice.ts` 1파일 +33/-3).
이 plan 시작 시점 `git log` 의 HEAD 는 `3e3f375` 였고 이 커밋은 그 뒤·`59af356` 앞에 있다.
**실행자가 만든 것이 아니며 이 plan 의 성과로 계상하지 않는다.** 루트 테스트 스위트는 이
커밋이 들어온 상태에서 돌았지만 결과는 베이스라인과 동일했다(17 failed / 681 passed / 2 skipped).

---

## 📌 아카이브는 20건(3회차)에서 시작한다

플래너 실측이 그대로 재확인됐다. `ls -1 card-news/output/<period>/`:

```
2026-05  -> 1  : city-overall
2026-W24 -> 18 : 102-seongsan,102-uichang,59-gimhae,59-jinhae,59-masanhappo,59-masanhoewon,
                 59-seongsan,59-uichang,84-gimhae,84-jinhae,84-masanhappo,84-masanhoewon,
                 84-seongsan,84-uichang,city-overall,city-value-84,city-volume,district-champions
2026-W25 -> 1  : city-overall
```

| 기간 | 발행 시리즈 수 | PNG | HTML |
|---|---|---|---|
| `2026-05` | **1** | 4 | **0** |
| `2026-W24` | **18** | 74 | 12 |
| `2026-W25` | **1** | 4 | 4 |
| **합계** | **20** | 82 | 16 |

파일 수 실측(`find output/<P> -type f`): `2026-05` 4 / `2026-W24` 86 / `2026-W25` 8 — 플랜 표와 일치.

**더 오래된 회차는 `card-news/output/` 에도 Supabase 버킷(`cardnews-payloads` 0개)에도 없다.**
아카이브를 늘리는 방법은 소급이 아니라 발행 빈도를 늘리는 것뿐이다. 이 SUMMARY 는 그 사실을
완화하지 않는다.

### 🔴 추가 실측 — `card-news/output/` 는 **gitignore 되어 있고 추적 파일이 0개다**

```
git check-ignore -v card-news/output/2026-W24/84-uichang/03-ranking.html
→ card-news/.gitignore:1:output/    card-news/output/2026-W24/84-uichang/03-ranking.html

git ls-files card-news/output/ | wc -l
→ 0
```

두 가지 결과가 따라온다:

1. **위 "발행 시리즈 수 1/18/1" 은 이 PC 로컬 파일에서만 도출된 값이다.** 권위 있는 발행
   원장이 아니라 사용자의 로컬 수동 실행 흔적이다. GitHub Actions 실행분은 artifact
   (retention 30일)로만 남았고 6월분은 이미 만료됐다. 현재 얻을 수 있는 최선의 근거지만,
   "이것이 발행 기록의 전부"라고 단언할 근거는 없다 — **이 PC 의 이 디렉터리가 유일본이다.**
2. **플랜의 acceptance `git status --porcelain card-news/output/` 빈 출력은 공허한 검사다.**
   ignore 된 경로라 무엇을 덮어써도 항상 빈 출력이다. 아래에 실효 있는 대체 증거를 남긴다.

---

## Task 1 — 소급 3회차 재생성 + 값 대조

### 40-03 잔재 확인 (적재 **전** 스윕)

```
npx supabase db query --linked "select slug, status, published_at from public.contents order by slug"
→ 1행: { "slug": "2026-w25-city-overall", "status": "published",
         "published_at": "2026-06-27 14:59:59+00" }
```

**`2026-w25-%` 는 정확히 1행.** 기대와 일치 → **삭제 0건.** (T-40-04-10 해당 없음.)
전체 테이블도 1행뿐이었다 — 40-03 외의 잔재도 없었다.

### 재생성 명령 3개 — 전부 `--series` 포함

```
cd card-news
S24=$(ls -1 output/2026-W24/ | paste -sd, -)

node scripts/generate.js --from=2026-06-21 --to=2026-06-27 --series=city-overall --dry-run --persist --out=<scratch>/p40-bf-w25
node scripts/generate.js --from=2026-06-14 --to=2026-06-20 --series="$S24"       --dry-run --persist --out=<scratch>/p40-bf-w24
node scripts/generate.js --month=2026-05                   --series=city-overall --dry-run --persist --out=<scratch>/p40-bf-2605
```

`--series` 값은 위 `ls -1` 목록과 문자열 단위로 동일하다(`$S24` 는 그 출력을 그대로 씀).

#### stdout 전문

**2026-W25**
```
창원부동산랩 카드뉴스 생성
기간: 2026년 6월 3주차 (2026-W25)
날짜: 06.21 ~ 06.27 신고 건
모드: 드라이런 (HTML만)
[city-overall] 창원+김해
  [dry] wrote 01-cover.html
  [dry] wrote 02-highlight.html
  [dry] wrote 03-ranking.html
  [dry] wrote 04-closing.html

적재 1건 / 건너뜀 0건 (슬라이드 0장)

완료! → output/2026-W25/
```

**2026-W24** (18시리즈 — 시리즈 목록만 발췌, 각 시리즈가 4파일씩 기록)
```
창원부동산랩 카드뉴스 생성
기간: 2026년 6월 2주차 (2026-W24)
날짜: 06.14 ~ 06.20 신고 건
모드: 드라이런 (HTML만)
[84-seongsan] 창원 성산구 84㎡ … [84-uichang] … [84-masanhappo] … [84-masanhoewon] …
[84-jinhae] … [84-gimhae] … [59-seongsan] … [59-uichang] … [59-masanhappo] …
[59-masanhoewon] … [59-jinhae] … [59-gimhae] … [102-seongsan] … [102-uichang] …
[city-overall] … [city-volume] … [city-value-84] …
[district-champions] 구별 대장단지
  [dry] wrote 01-grid.html
  [dry] wrote 02-closing.html

적재 18건 / 건너뜀 0건 (슬라이드 0장)

완료! → output/2026-W24/
```

**2026-05**
```
창원부동산랩 카드뉴스 생성
기간: 2026년 5월 전체 (2026-05)
날짜: 05.01 ~ 05.31 신고 건
모드: 드라이런 (HTML만)
[city-overall] 창원+김해
  [dry] wrote 01-cover.html
  [dry] wrote 02-highlight.html
  [dry] wrote 03-ranking.html
  [dry] wrote 04-closing.html

적재 1건 / 건너뜀 0건 (슬라이드 0장)

완료! → output/2026-05/
```

건너뜀 **0건** — `buildContentRow` 가 `null` 을 돌려준 시리즈는 없다.

#### 인자가 원본 회차를 정확히 재현한다는 증거

| 회차 | 재생성 weekLabel / period | 아카이브 HTML 실측 |
|---|---|---|
| `2026-W24` | `2026년 6월 2주차` / `06.14 ~ 06.20 신고 건` | 커버 `WEEKLY REPORT · 2026년 6월 2주차`, 푸터 `06.14 ~ 06.20 신고 건` — **일치** |
| `2026-W25` | `2026년 6월 3주차` / `06.21 ~ 06.27 신고 건` | 푸터 `06.21 ~ 06.27 신고 건` — **일치** |
| `2026-05` | `2026년 5월 전체` / `05.01 ~ 05.31 신고 건` | HTML 0개 — **대조 불가** |

`2026-05` 의 `publishedAt` 확인: `2026-05-31 14:59:59+00` = **`2026-05-31T23:59:59+09:00`** ✅

---

### 🔴 (2) 값 대조 — 시리즈 4개 × TOP5

원본 값은 아카이브 `03-ranking.html` 의 `row-complex` / `row-price` 를 정규식으로 뽑았다
(일회성 비교 전용 스크립트. 제품 코드·`persist-contents.js` 에 넣지 않았다 — D-02).
재생성 값은 적재된 `contents.body.slides` 의 `sub` 앞부분(단지명)과 `big`(가격)이다.

`placeholder-text` / `row-price-placeholder` 클래스가 붙은 행은 `pad10` 이 채운 빈 자리이며
**원본이 실제로 발행한 값이 아니다** — 표에 `(미발행 플레이스홀더)` 로 표기한다.

#### 표 1 — `2026-W24 / 84-seongsan`

| 순위 | 원본 단지명 | 원본 가격 | 재생성 단지명 | 재생성 가격 | 일치? |
|---|---|---|---|---|---|
| 1 | 용지아이파크 | 10억 4,000 | 용지아이파크 | 10억 4,000 | ✅ |
| 2 | 창원 센텀 푸르지오 | 8억 4,000 | 창원 센텀 푸르지오 | 8억 4,000 | ✅ |
| 3 | 트리비앙아파트 | **6억 9,500** | 트리비앙아파트 | **7억 1,400** | ❌ 가격만 |
| 4 | 노블파크 | 6억 8,800 | 노블파크 | 6억 8,800 | ✅ |
| 5 | 포레나대원아파트 | 6억 8,500 | 포레나대원아파트 | 6억 8,500 | ✅ |

#### 표 2 — `2026-W24 / 59-jinhae`

원본 TOP10 중 **실발행 행은 2개뿐**(3~10위 전부 플레이스홀더). 재생성 슬라이드는 3장.

| 순위 | 원본 단지명 | 원본 가격 | 재생성 단지명 | 재생성 가격 | 일치? |
|---|---|---|---|---|---|
| 1 | 시티프라디움1차아파트 | 1억 7,600 | 시티프라디움1차아파트 | 1억 7,600 | ✅ |
| 2 | 녹산풍림아파트 | **9,300만** | 녹산풍림아파트 | **1억 3,500** | ❌ 가격만 |
| 3 | (미발행 플레이스홀더) | — | 성신아트빌라 | 7,500만 | ➕ 신규 |
| 4 | (미발행 플레이스홀더) | — | (없음) | — | — |
| 5 | (미발행 플레이스홀더) | — | (없음) | — | — |

#### 표 3 — `2026-W24 / 84-uichang`

| 순위 | 원본 단지명 | 원본 가격 | 재생성 단지명 | 재생성 가격 | 일치? |
|---|---|---|---|---|---|
| 1 | LH피닉스포레 | 3억 7,000 | **창원중동유니시티1단지** | **9억 5,000** | ❌ 둘 다 |
| 2 | 감계아내에코프리미엄2차 | 3억 5,900 | LH피닉스포레 | 3억 7,000 | ❌ 둘 다 |
| 3 | 감계힐스테이트2차 | 3억 3,800 | 감계아내에코프리미엄2차 | 3억 5,900 | ❌ 둘 다 |
| 4 | 덕산세흥파크 | 1억 2,000 | 감계힐스테이트2차 | 3억 3,800 | ❌ 둘 다 |
| 5 | (미발행 플레이스홀더) | — | 감계힐스테이트3차 | 2억 6,800 | ➕ 신규 |

📌 순위별로는 4행 전부 불일치지만, **원본의 4개 단지 중 3개는 가격이 그대로인 채 순위만
한 칸씩 밀렸다.** 신규 1위(창원중동유니시티1단지 9억 5,000)가 위에 끼어든 결과다.
원본 4위 덕산세흥파크(1억 2,000)는 TOP5 밖으로 밀려났다.

#### 표 4 — `2026-W25 / city-overall`

| 순위 | 원본 단지명 | 원본 가격 | 재생성 단지명 | 재생성 가격 | 일치? |
|---|---|---|---|---|---|
| 1 | 은아아파트 | 9억 9,500 | **용지더샵레이크파크아파트** | **16억 3,000** | ❌ 둘 다 |
| 2 | 트리비앙아파트 | 7억 800 | **중동유니시티4단지** | **10억 3,000** | ❌ 둘 다 |
| 3 | 포레나대원아파트 | 7억 | 은아아파트 | 9억 9,500 | ❌ 둘 다 |
| 4 | 노블파크 | 6억 4,800 | 창원 중동 유니시티 2단지 | 9억 2,000 | ❌ 둘 다 |
| 5 | 에일린의뜰1단지 | 6억 2,800 | 창원중동유니시티3단지 | 9억 900 | ❌ 둘 다 |

📌 원본 TOP5 중 **은아아파트 1건만 재생성 TOP5 에 살아남았고**(1위 → 3위, 가격 동일),
나머지 4개는 전부 5위 밖으로 밀렸다. 상위 4자리를 신규 행이 차지했다.

#### 표 5 — `2026-05 / city-overall` : 🔴 **대조 불가**

`card-news/output/2026-05/` 에는 **PNG 4개만 있고 HTML 이 0개**다. 텍스트를 뽑을 원본이
없으므로 값 비교를 수행하지 못했다. **"일치"로 표기하지 않는다.** 사람이 PNG 를 눈으로
확인해야 한다(체크포인트 B-1 로 넘김).

참고 — 재생성된 `2026-05-city-overall` 은 슬라이드 5장, `published_at = 2026-05-31 14:59:59+00`.

### 판정 요약 (숫자)

원본이 실제로 발행한 행만 분모로 잡는다(플레이스홀더 제외).

| 항목 | 건수 |
|---|---|
| **비교 행 수** | **16** (seongsan 5 + jinhae 2 + uichang 4 + w25 5) |
| 완전일치 | **5** |
| 단지명만 다름 | **0** |
| 가격만 다름 | **2** |
| 둘 다 다름 | **9** |
| (참고) 원본 플레이스홀더 자리에 생긴 재생성 신규 행 | 2 |
| (참고) 원본에 있었으나 재생성 TOP5 밖으로 밀린 행 | 5 |

**완전일치율 = 5 / 16 = 31.3%.** 플랜의 기준선 **80% 에 크게 미달**한다.
`2026-05` 는 이 분모에 포함되지 않는다(대조 불가).

---

### 🔴 차이의 원인 — 추측이 아니라 `created_at` 으로 귀속했다

플랜이 제시한 원인 후보 3가지를 각각 **측정**했다. 결과는 **3번 단독**이다.

기간 전체 집계 (창원 5구 + 김해, `deal_type='sale'`):

| 회차 | 전체 거래 | `cancel_date` 있음 | `superseded_by` 있음 | 발행 시점 **이후** 적재 |
|---|---|---|---|---|
| `2026-W24` (발행 2026-06-24) | 377 | 15 | **0** | **78 (20.7%)** |
| `2026-W25` (발행 2026-06-29) | 376 | 7 | **0** | **106 (28.2%)** |

**① 취소 거래 — 기여 0.** 기간 내 취소는 존재하지만(15/7건), 비교한 16개 원본 행은
**전부 지금도 `cancel_date is null`·`superseded_by is null` 인 살아 있는 행**이다.
원본 값이 사라져서 순위가 바뀐 사례는 **0건**이다. (W25 원본 TOP5 5건 전수 확인:
은아 99,500 / 트리비앙 70,800 / 포레나대원 70,000 / 노블파크 64,800 / 에일린의뜰1단지 62,800
— 5건 모두 `cancel_date null`, `superseded false`.)

**② 정정 거래 — 기여 0.** 두 기간 모두 `superseded_by is not null` 이 **0건**이다.

**③ 지연 신고 — 관측된 모든 차이를 설명한다.** 차이를 만든 행의 `created_at` 이
전부 발행 시점보다 늦다:

| 차이 | 신규/변경 행 | `deal_date` | `created_at` | 발행 시점 대비 |
|---|---|---|---|---|
| 표 1 r3 가격 ↑ | 트리비앙아파트 7억 1,400 | 2026-06-15 | **2026-07-02** | 발행 8일 후 |
| 표 2 r2 가격 ↑ | 녹산풍림아파트 1억 3,500 | 2026-06-19 | **2026-06-24 21:05 UTC** | 발행 **13시간 후** |
| 표 2 r3 신규 | 성신아트빌라 7,500만 | 2026-06-15 | **2026-07-02** | 발행 8일 후 |
| 표 3 r1 신규 | 창원중동유니시티1단지 9억 5,000 | 2026-06-19 | **2026-07-07** | 발행 13일 후 |
| 표 3 r5 신규 | 감계힐스테이트3차 2억 6,800 | 2026-06-15 | **2026-07-03** | 발행 9일 후 |
| 표 4 r1 신규 | 용지더샵레이크파크 16억 3,000 | 2026-06-25 | **2026-07-03** | 발행 4일 후 |
| 표 4 r2 신규 | 중동유니시티4단지 10억 3,000 | 2026-06-22 | **2026-06-30** | 발행 1일 후 |
| 표 4 r4 신규 | 창원 중동 유니시티 2단지 9억 2,000 | 2026-06-27 | **2026-07-15** | 발행 16일 후 |
| 표 4 r5 신규 | 창원중동유니시티3단지 9억 900 | 2026-06-27 | **2026-07-02** | 발행 3일 후 |

아카이브 파일 mtime 이 발행 시점의 근거다: W24 HTML `2026-06-24 17:03~17:08 KST`,
W25 HTML `2026-06-29 18:18 KST`. 표 2 의 녹산풍림 건은 `2026-06-24 21:05 UTC`
= `2026-06-25 06:05 KST` 로, 카드뉴스 생성(17:08 KST)보다 **약 13시간 늦다** — 경계 사례까지
시각 단위로 확인했다.

**④ 코드 드리프트 — 배제됐다(측정함).** 재생성이 *당시와 다른 코드* 로 돌았을 가능성을
확인했다. 아카이브 생성 시점 커밋(`cc5d741`, 2026-06-24) 대비 현재까지 `fetch-data.js` 의
diff 훅 헤더는 7개인데, 이 회차들이 쓰는 5개 함수
(`fetchAreaRanking`·`fetchCityRanking`·`fetchVolumeRanking`·`fetchValueRanking`·`fetchDistrictChampions`)
에서 바뀐 것은 **시그니처의 `from`/`to` 인자 배선 2줄씩이 전부**이고 쿼리 본문
(`select`·필터·정렬)은 **무변경**이다. 2026-06-25 에 추가된 `filterOutliers` 는
`fetchJeonseRanking`·`fetchMonthlyRanking`·`fetchAllTimeHighRanking` 에서만 호출되며
**이 5개 함수 어디에서도 쓰이지 않는다.** → 값 차이는 코드가 아니라 **데이터** 때문이다.

> 요컨대: **국토부 실거래 신고는 계약 후 최대 30일까지 들어온다.** 발행 당시 스냅숏과
> 지금의 스냅숏이 다른 것은 정상이며, 상위 회차일수록 고가 신규 건 하나로 TOP5 가
> 통째로 밀린다. 이건 "허용 오차"가 아니라 **재실행 방식(D-02)의 구조적 성질**이다.

---

### (3) 소급 유지 vs 포기 — 권고와 근거

플랜의 판정 기준: 완전일치 ≥ 80% → 유지 / < 80% 또는 TOP1 이 여러 시리즈에서 바뀜 → 사용자에게 질의.

**관측: 완전일치 31.3%(5/16), 그리고 TOP1 이 4개 시리즈 중 2개(84-uichang·W25 city-overall)에서
바뀌었다. → 두 조건 모두 "사용자 질의" 쪽이다.**

🔴 **실행자 단독으로 삭제하지 않았다.** 20행은 현재 그대로 적재돼 있다.

판단에 필요한 사실을 양쪽 다 적는다:

| 유지 쪽 근거 | 포기 쪽 근거 |
|---|---|
| 차이의 원인이 **전부 지연 신고**로 규명됐다 — 값이 틀린 게 아니라 **더 완전해졌다** | 아카이브에 실린 값이 인스타·카페에 나간 원본과 **다르다**. 독자가 대조하면 어긋난다 |
| 취소·정정 기여 0건 — 잘못된 데이터가 섞인 게 아니다 | 84-uichang·W25 는 TOP1 자체가 달라 "그때 그 카드뉴스"로 보기 어렵다 |
| 포기하면 아카이브가 **1건**(40-03의 W25)으로 줄어든다 | 소급을 포기해도 앞으로의 회차는 정상 축적된다 |
| 재실행 방식은 D-02 가 확정한 방법이고 값 재계산 없이 원문 문자열을 그대로 쓴다 | `2026-05` 는 **끝내 대조 불가**다 — 검증되지 않은 1건이 남는다 |

**포기 시 롤백 SQL (보여주기만 함 — 실행하지 않았다):**
```sql
delete from public.contents
where site_id = 'changbuletter' and slug like '2026-w24-%';   -- 18행
delete from public.contents
where site_id = 'changbuletter' and slug like '2026-05-%';    --  1행
```
⚠️ **`2026-W25` 는 slug 로 소급분과 구분되지 않는다.** 40-03 이 이미 같은 slug
(`2026-w25-city-overall`)로 적재했고 이번 재실행이 그 위에 멱등하게 덮었다. 즉 "소급분만
제거"해도 W25 1행은 남으며, 그 1행의 값 역시 **원본과 다르다**(표 4). W25 까지 지우려면
아카이브는 0행이 된다.

---

### (4) 🔴 회차별 행 수 ≤ 디렉터리 수 — 허위 발행물 0건의 증거

```
select split_part(slug,'-',1)||'-'||split_part(slug,'-',2) as period, count(*) as rows,
       min(published_at), max(published_at), sum(jsonb_array_length(body->'slides'))
from public.contents where site_id='changbuletter' and type='card_news' group by 1 order by 1
```
```
period     rows  min_pub                  max_pub                  total_slides
2026-05      1   2026-05-31 14:59:59+00   2026-05-31 14:59:59+00        5
2026-w24    18   2026-06-20 14:59:59+00   2026-06-20 14:59:59+00       85
2026-w25     1   2026-06-27 14:59:59+00   2026-06-27 14:59:59+00        5
```

| period | 실측 rows | 디렉터리 수 | 판정 |
|---|---|---|---|
| `2026-05` | **1** | 1 | ✅ ≤ |
| `2026-w24` | **18** | 18 | ✅ ≤ |
| `2026-w25` | **1** | 1 | ✅ ≤ |
| **합계** | **20** | 20 | ✅ **초과 0건** |

부족분 0 — stdout 의 "건너뜀 0건" 과 정합한다.
`--series` 없이 돌렸다면 54행이 되어 **34행이 허위 발행물**이 됐을 것이다.

```
select count(*) as total, count(distinct slug) as distinct_slug from public.contents
→ { "total": 20, "distinct_slug": 20 }        ✅ 멱등 (W25 재적재로 행 증가 0)
```

⛔ **"기간 그룹 3개"와 `total === distinct_slug` 만으로 통과 판정하지 않았다.** 두 검사는
`--series` 누락 시에도 통과한다(54행이어도 그룹 3개·total==distinct). 실효 있는 검사는
**회차별 행 수 ≤ 디렉터리 수** 하나뿐이며, 그것을 위 표로 단언했다.

**적재된 slug 전체 20건:**
```
2026-05-city-overall
2026-w24-102-seongsan  2026-w24-102-uichang   2026-w24-59-gimhae     2026-w24-59-jinhae
2026-w24-59-masanhappo 2026-w24-59-masanhoewon 2026-w24-59-seongsan  2026-w24-59-uichang
2026-w24-84-gimhae     2026-w24-84-jinhae     2026-w24-84-masanhappo 2026-w24-84-masanhoewon
2026-w24-84-seongsan   2026-w24-84-uichang    2026-w24-city-overall  2026-w24-city-value-84
2026-w24-city-volume   2026-w24-district-champions
2026-w25-city-overall
```
슬라이드 수는 대부분 5장, `2026-w24-59-jinhae` 3장(실데이터 3건뿐),
`2026-w24-district-champions` 6장(구 6개).

**4필드 계약 전수 확인 (SC3 확장):**
```
select count(*) total_slides,
       count(*) filter (where s ?& array['kicker','big','label','sub']) has_4,
       count(*) filter (where (select count(*) from jsonb_object_keys(s)) = 4) exactly_4
from public.contents c, lateral jsonb_array_elements(c.body->'slides') s
→ { "total_slides": 95, "has_4": 95, "exactly_4": 95 }
```
20행 **95장 전부** 정확히 `kicker`·`big`·`label`·`sub` 4필드다.

### (5) 코드 변경 0건 확인

```
git status --porcelain
→  M supabase/.temp/cli-latest        # 이 plan 시작 전부터 더러웠던 Supabase CLI 버전 캐시
git status --porcelain supabase/migrations/  → 빈 출력 (마이그레이션 0건)
npm run lint → exit 0, ✔ No ESLint warnings or errors
```

**`card-news/output/` 무접촉 — gitignore 우회 증거:**

`git status` 는 ignore 된 경로에 무력하므로 mtime·파일 수로 대신 단언한다.

| 파일 | 재생성 **후** mtime | 기대 |
|---|---|---|
| `output/2026-W24/84-seongsan/03-ranking.html` | `2026-06-24 17:03` | 6월 원본 그대로 ✅ |
| `output/2026-W24/84-uichang/03-ranking.html` | `2026-06-24 17:07` | ✅ |
| `output/2026-W24/59-jinhae/03-ranking.html` | `2026-06-24 17:08` | ✅ |
| `output/2026-W25/city-overall/03-ranking.html` | `2026-06-29 18:18` | ✅ |
| `output/2026-05/city-overall/03-ranking.png` | `2026-06-29 18:30` | ✅ |

파일 수도 무변경(4 / 86 / 8). 새 출력 78개는 전부 scratchpad 로 갔다
(`p40-bf-w24` 70 · `p40-bf-w25` 4 · `p40-bf-2605` 4). **오늘 날짜 mtime 이 하나도 없다.**

---

## Task 2 — 주간 자동화 `--persist` 배선 + 죽은 사본 경고

**커밋 `59af356`.** `git diff HEAD~1 --numstat`:
```
3	1	.github/workflows/weekly-generate.yml
3	0	card-news/.github/workflows/weekly-generate.yml
```

```diff
--- a/.github/workflows/weekly-generate.yml
+++ b/.github/workflows/weekly-generate.yml
@@ -62,7 +62,9 @@ jobs:
           ARGS=""
           if [ "${{ inputs.dry_run }}" = "true" ]; then ARGS="$ARGS --dry-run"; fi
           if [ -n "${{ inputs.series }}" ]; then ARGS="$ARGS --series=${{ inputs.series }}"; fi
-          node scripts/generate.js $ARGS
+          # --persist: 슬라이드 데이터를 contents 에 적재한다 (창부레터 0-4 / ADR-004 §2).
+          #            없으면 웹 뷰어와 아카이브가 빈 화면이 된다.
+          node scripts/generate.js --persist $ARGS
```
```diff
--- a/card-news/.github/workflows/weekly-generate.yml
+++ b/card-news/.github/workflows/weekly-generate.yml
@@ -1,3 +1,6 @@
+# ⚠️ 이 파일은 실행되지 않습니다.
+#    GitHub Actions 는 저장소 루트 .github/workflows/ 만 읽습니다.
+#    실제로 도는 것은 <repo>/.github/workflows/weekly-generate.yml 입니다 (그쪽만 수정하세요).
 name: Weekly Card News Generation
```

`--persist` 는 `$ARGS` **앞**에 있다. 삭제 파일 0건(`git diff --diff-filter=D` 빈 출력).

**시크릿 — 신규 0개.** 루트 워크플로 `Generate card news` 스텝이 이미 주입한다:
```
SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```
`persist-contents.js:104` 가 요구하는 env 이름(`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`)과 **정확히 일치**한다.

**YAML 파싱 검증 (눈으로 보는 대신 파서로 확인 — `js-yaml` 사용):**
```
=== .github/workflows/weekly-generate.yml
  jobs: generate
  cron: [{"cron":"10 15 * * 0"}]                                  ← 무변경
  steps: checkout | setup-node | Install Chromium … | Install dependencies |
         Cache Pretendard fonts | Download Pretendard fonts | Generate card news |
         Upload PNG artifacts | Post to Instagram                 ← 9개 전부 유지
  env: {"SUPABASE_URL":"${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}", …}   ← 무변경
  run:  ARGS="" / if dry_run … / if series … / #주석2줄 / node scripts/generate.js --persist $ARGS
=== card-news/.github/workflows/weekly-generate.yml
  PARSED ok — cron·steps·env 무변경 (경고 주석 3줄만 추가)
```
스케줄·Instagram 스텝·아티팩트 업로드 스텝 **무변경**을 파서 출력으로 확인했다.

⚠️ **acceptance 수치 정정**: 플랜은 `grep -c -- "--persist" == 1` 을 요구했으나 **실측 2**다.
플랜이 지시한 주석 본문 자체에 `--persist` 문자열이 들어 있기 때문이다(자기모순).
**실행 줄은 1건**(`:67`), 나머지 1건은 주석(`:65`)이다.

---

## 🔴 Task 2 의 부작용 — 사용자 결정이 필요하다 (실행자가 대신 정하지 않았다)

배선 자체는 플랜대로 했지만, 그 결과 발생하는 사실을 그대로 적는다.

**주간 cron 실행에는 `inputs.series` 가 없다.** `workflow_dispatch` 인풋은 스케줄 실행에서
비어 있으므로 `ARGS` 는 빈 문자열이고, 실행 명령은 사실상 `node scripts/generate.js --persist`
가 된다. `generate.js` 는 `--series` 가 없으면 **18시리즈 전부**를 돌므로,
**앞으로 매주 18행이 `status='published'` 로 적재된다.**

그런데 실측된 과거 발행 패턴은 **1 / 18 / 1** 이다 — 3회차 중 2회차는 `city-overall` 1개만
발행됐다. Instagram 포스팅 스텝도 기본값이 `city-overall` 하나이고 수동 실행에서만 돈다.

→ **"생성 18개 ≠ 발행 1개" 인 주가 있었고, 앞으로는 18개 전부가 아카이브에 발행물로 올라간다.**
이건 Task 1 이 `--series` 로 그토록 막으려 한 `T-40-04-09`(허위 발행물)의 **미래형**이다.
`generate.js` 는 이 경우 경고를 찍지만(40-03 이 추가) 차단하지는 않는다.

🔴 **실행자가 임의로 정하지 않았다.** 플랜은 Task 2 의 diff 를 명시적으로 지정했고
"스케줄 스텝을 건드리지 말라"고 했으므로 지시대로 배선만 했다. 선택지는 셋이다:

| 선택 | 방법 | 결과 |
|---|---|---|
| **A. 그대로 둔다** | 변경 없음 | 매주 18행 적재. 웹 아카이브 = "생성된 전부"로 정의 |
| **B. cron 을 city-overall 로 한정** | 스케줄 실행 시 `--series=city-overall` 기본값 부여 | 아카이브 = 인스타 발행분과 일치. 나머지 17개는 PNG 아티팩트로만 |
| **C. `--persist` 를 수동 실행 전용으로** | `if [ -n "inputs.series" ]` 조건 안으로 이동 | cron 은 적재 안 함 — 0-4 의 "자동 적재" 목표가 무산됨 |

이 결정은 **다음 월요일 00:10 KST 이전**에 내리면 되지만, 배포(B-3)를 승인하면 그때부터
유효해진다. 배포 보류 시에는 시간 여유가 있다.

---

## Task 3 — 체크포인트 (미완 · BLOCKING)

`autonomous: false` 이고 Task 3 은 `gate="blocking"` 이다. **여기서 중단하고 사용자 답을
기다린다.** 아래 A·C·D 는 준비를 마쳤고, B 세 질문은 이 SUMMARY 하단과 실행자 보고에 있다.

### A. 0-4 Success Criteria 대조 (증거 출처 포함)

| # | 40-CONTEXT Success Criteria | 판정 | 증거 |
|---|---|---|---|
| 1 | `buildSlides(data)` 존재, 템플릿과 DB 적재가 같은 원천 | **충족(재해석본으로)** | 40-01 SUMMARY. 🔴 **D-01 재해석**: "템플릿이 slides 를 렌더"는 구현 불가(`renderRanking` 은 10행, `renderHighlight` 는 필드별 DOM)라 **공유 `data` + `subLine` 단일 헬퍼 + containment 테스트**로 대체됐다. `build-slides.test.mjs` 케이스 18~21(**21 passed** 재실행 확인)이 4필드 × 전 슬라이드가 렌더 HTML 안에 실재함을 기계적으로 강제한다 |
| 2 | 리팩터 전후 HTML 동일 | **충족** | 40-01 SUMMARY — 전 18시리즈 `diff -r` 빈 출력. 🔴 **기준은 재생성 산출물 간 비교이며 `card-news/output/` 의 아카이브 16개는 기준으로 쓰지 않았다** — 40-01 이 아카이브 HTML 의 **디자인 드리프트**를 실측해 배제했다. 이번 plan 도 그 실측을 재확인했다(아카이브 HTML 의 순위 마크업은 값 비교에만 사용) |
| 3 | `contents` 행 생성 + `body.slides[*]` 4필드 | **충족** | 이번 plan — 20행 / **95 슬라이드 전부 `exactly_4 = 95`**. 40-03 의 1행 표본을 20행 전수로 확장 |
| 4 | 두 번 적재해도 중복 없음 | **충족** | `total = 20`, `distinct_slug = 20`. W25 는 40-03 이 적재한 행 위에 이번에 다시 적재됐고 **행 증가 0** |
| 5 | 소급 3회차 반영 **또는** 미반영 사유 기록 | **반영됨 — 단 승인 대기** | 이번 plan — 3회차 20행 적재 완료 + 값 대조 표 4개 + 완전일치율 31.3%. 🔴 **유지/포기는 B-1 미결** |

⛔ 증거를 못 찾아 "충족"으로 쓴 항목은 없다. 5번은 "적재는 됐으나 유지 여부 미결"로 표기했다.

### C. 최종 재실행 결과

| 명령 | 결과 |
|---|---|
| `npm run lint` | **exit 0** — `✔ No ESLint warnings or errors` |
| `npx supabase migration list --linked` | **152건 전부 local==remote** — 미적용 0 / 미기록 0 (**drift 0**) |
| `node card-news/scripts/templates-golden.test.mjs` | **14 passed / 0 failed** — HTML 무변경 유지 |
| `node card-news/scripts/build-slides.test.mjs` | **21 passed / 0 failed** |
| `node card-news/scripts/persist-contents.test.mjs` | **12 passed / 0 failed** |
| `node card-news/scripts/templates.test.mjs` | **14 passed / 0 failed** |
| `npx vitest run src/lib/db/onconflict-audit.test.ts` | **26 passed / 0 failed / 0 skipped** |

**루트 전체 스위트 (`npm run test -- --run`):**

| | Test Files | Tests |
|---|---|---|
| 40-01/40-03 베이스라인 | 6 failed / 99 passed (105) | 17 failed / 681 passed / 2 skipped (700) |
| **이번 plan 실행 후** | **6 failed / 99 passed (105)** | **17 failed / 681 passed / 2 skipped (700)** |

**실패 이름 집합 — 문자열 단위로 불변.** 17건 내역:
`complex-matching-3b` 4 · `favorites` 3 · `molit-ingest` 3 · `reviews` 3 ·
`school-ranking-regional` 1 · `seed-region` 3 = **17**. 40-01-SUMMARY 의 목록과 동일하며
전부 로컬 DB 의존 통합 테스트다. **이 plan 이 만든 신규 실패 0건.**

**`contents` 최종 조회:**
```
select site_id, type, status, count(*), count(distinct slug) from public.contents group by 1,2,3
→ { "site_id": "changbuletter", "type": "card_news", "status": "published",
    "cnt": 20, "distinct_slug": 20 }
```

---

## 🔴 B. 체크포인트 — 사용자 결정 (전부 회신됨)

### B-1. 소급 적재 → **유지**

DELETE 는 **실행하지 않았다.** `contents` 20행이 그대로 아카이브가 된다.

근거로 기록한다:
- 비교 16행 중 **완전일치 5건**. 나머지 11건의 차이는 **100% 지연 신고**로 귀속된다
  (거래일로부터 13시간 ~ 16일 뒤 적재). **취소 기여 0 / 정정 기여 0** — 비교한 16개 원본 행은
  전부 지금도 `cancel_date is null`·`superseded_by is null` 인 살아 있는 행이고, 두 기간의
  `superseded_by` 는 0건이다.
- 사용자가 W25 최고가 거래들에서 독립적으로 같은 결과를 재확인했다
  (`created_at` 이 `deal_date` 보다 13~15일 늦고, `cancel_date`·`superseded_by` 둘 다 null).
- 🔴 **재생성 값은 원본의 오류를 고친 것이 아니라, 원본보다 *더 완전한* 스냅숏이다.**
  발행 당시에는 아직 신고되지 않았던 거래가 그 뒤 들어와 순위에 반영됐을 뿐이다.
  "원본이 틀렸다"도 "재생성이 틀렸다"도 아니다 — 같은 기간의 서로 다른 시점 스냅숏이다.
- `2026-05` 는 여전히 **대조 불가**(PNG만)이며, 유지 결정은 이 1건이 미검증인 채로 남는다는
  사실을 포함한다.

### B-2. 아카이브 20건 → **그대로 진행**

부풀리지 않고 기록한다: **3 회차 / 20건.** `2026-05`(1) · `2026-W24`(18) · `2026-W25`(1).

**아카이브를 늘리는 방법은 발행 빈도를 늘리는 것뿐이다 — 소급으로는 늘릴 수 없다.**
더 오래된 회차는 어디에도 존재하지 않는다: `card-news/output/` 에 3기간뿐,
Supabase `cardnews-payloads` 버킷 **0개**, GitHub Actions artifact 는 **retention 30일**로
6월분이 이미 만료됐다.

### B-3. 배포 → **사용자가 직접 `git push` 함 (완료)**

🔴 **실행자는 `git push` 를 실행하지 않았다.** 작업 중 사용자가 직접 push 했고, 그 사실은
`git reflog show origin/main` 의 `update by push` 로 확인된다. `origin/main` = `34b13ac`.

**B-4 수정이 포함된 상태로 배포됐다** — 확인 방법과 결과:
```
git merge-base --is-ancestor 59af356 origin/main   → ON ORIGIN   (--persist)
git merge-base --is-ancestor 3bbabb9 origin/main   → ON ORIGIN   (--persist-series)

git show origin/main:.github/workflows/weekly-generate.yml
→ PERSIST_SERIES="${{ inputs.series }}"
  if [ -z "$PERSIST_SERIES" ]; then PERSIST_SERIES="city-overall"; fi
  node scripts/generate.js --persist --persist-series="$PERSIST_SERIES" $ARGS
```

🔴 **타이밍 — 18행 사고는 발생하지 않았고 대기 중인 것도 없다.**
크론은 `10 15 * * 0`(월 00:10 KST)이다. 이번 주 실행은 **오늘 00:10 KST 에 이미 끝났고**
그 시점 워크플로에는 `--persist` 자체가 없었으므로 크론이 적재한 행은 **0건**이다
(`contents` 20행은 전부 40-04 소급분과 일치한다). **다음 실행은 2026-08-10(월) 00:10 KST**이며
그때는 `city-overall` 1건만 적재된다.

📌 `.planning/` 문서 커밋 `8802d34` 는 **미푸시**로 남아 있다 (실행자는 push 하지 않는다).

### B-4. 주간 크론 적재 범위 → **`city-overall` 만** (코드 변경 — 배포 전 반영 완료)

🔴 **이 변경은 push 전에 들어가야 했다.** 오늘이 월요일(2026-08-03)이고 워크플로는
`cron: '10 15 * * 0'`(월 00:10 KST)로 돈다 — `--persist` 만 배선된 상태로 배포했다면
사용자가 방금 거부한 **18행 일괄 적재**가 바로 다음 실행에서 발생했을 것이다.

#### 구현 (커밋 `3bbabb9`)

핵심은 **"무엇을 만드는가"와 "무엇을 아카이브에 올리는가"를 분리**한 것이다.
`--series` 하나로 둘 다 제어하면 적재를 좁히는 순간 PNG 생성도 같이 좁아진다
(사용자 요구: PNG 생성 범위는 18시리즈 그대로).

| 파일 | 변경 |
|---|---|
| `card-news/scripts/persist-contents.js` | `shouldPersistSeries(seriesId, persistSeries)` **순수 함수** 신설 — 판정 단일 지점. 왜 범위를 좁히는지와 "넓히지 말 것" 경고를 함수 주석에 남겼다 |
| `card-news/scripts/generate.js` | `--persist-series=` 파싱 + **3개 push 지점 전부** 가드. 헤더 문서에 `--series` vs `--persist-series` 구분 명시 |
| `card-news/scripts/generate.js` | 🔴 경고 경로 확장 — `persist && !filter && !persistSeries` 일 때만 경고하고, 문구에 `--persist-series` 사용법을 추가. 범위가 지정된 경우엔 `적재 범위: …` 를 **stdout 에 남겨 증거로 만든다** |
| `.github/workflows/weekly-generate.yml` | `--persist --persist-series="$PERSIST_SERIES"`. cron(인풋 없음) → `city-overall`. 수동 실행에서 `series` 를 주면 그것이 곧 발행 의도이므로 적재 범위도 따라간다 |
| `card-news/scripts/persist-contents.test.mjs` | 케이스 **13~16** 추가 (12 → **16 passed**) |

테스트는 **기존 파일에 자연스러운 자리가 있었다** — `persist-contents.test.mjs` 는 이미
DB 없는 순수 함수 단위 테스트고, `shouldPersistSeries` 도 순수 함수다. 새 파일을 만들지 않았다.
케이스 15가 핵심이다 — 18시리즈 id 전체를 놓고 `city-overall` 1개만 남는 것과, 범위를 안 주면
18개 전부가 대상이 되는 것을 **한 테스트 안에서 대조**해 그 차이를 고정한다.

#### 🔴 실측 검증 — 단위 테스트만으로 끝내지 않았다

배선(3개 push 지점)이 실제로 동작하는지는 단위 테스트가 증명하지 못한다. 그래서
**크론과 같은 조건**(`--series` 없음)으로 라이브 실행했다:

```
node scripts/generate.js --from=2026-06-21 --to=2026-06-27 \
  --dry-run --persist --persist-series=city-overall --out=<scratch>/p40-b4-verify
```
```
적재 범위: --persist-series=city-overall (생성 범위와 별개)
[84-seongsan] … [102-uichang] … [city-overall] … [district-champions]   ← 18시리즈 전부 생성
적재 1건 / 건너뜀 0건
```

| 항목 | 실측 | 판정 |
|---|---|---|
| 생성된 시리즈 디렉터리 | **18** | PNG/HTML 생성 범위 무변경 ✅ |
| 적재 건수 | **1** | `city-overall` 만 ✅ |
| `contents` 총 행 수 (전 → 후) | **20 → 20** | 불변 ✅ |
| `2026-w25-%` 행 수 | **1 → 1** | 불변 ✅ |
| 경고 출력 | 없음 (범위 지정됨) | 의도대로 ✅ |

🔴 **이 변경이 없었다면 같은 명령이 `2026-w25-%` 를 18행으로 만들어 총 37행이 됐을 것이다.**
그것이 바로 크론이 매주 하게 될 일이었다.

검증도 함께 했다: `js-yaml` 파싱 통과, `cron: '10 15 * * 0'`·9개 스텝(Instagram 포함)·`env` 무변경,
`run` 블록을 추출해 `bash -n` 문법 검사 통과.

---

## 🔴 B-5. `price_change` 지역 범위 — 창부레터가 읽을 때 필터한다 (bds 코드 변경 0건)

**결정**: 배치는 **전국 유지**. `실거래이야기`가 같은 배치를 재사용할 수 있어야 한다는
ADR-005 의 의도가 그것이다. **창부레터가 읽는 쪽에서 필터한다.**

### 실측 (2026-08-03, `computed_at` 전 행 동일)

`complex_rankings where rank_type='price_change'` — 총 **22행**:

| si | 행 수 | 최상위 rank |
|---|---|---|
| 부산광역시 | **12** | **1** |
| 창원시 | 6 | 4 |
| 김해시 | 2 | 9 |
| 양산시 | 2 | 16 |
| **창원·김해 소계** | **8 / 22** | **4** |

상위 6행:

| rank | 단지 | si | `metadata.region` |
|---|---|---|---|
| 1 | 동래래미안아이파크**아파트** | 부산광역시 | `동래구` |
| 2 | 삼익비치아파트 | 부산광역시 | `수영구` |
| 3 | 백양디이스트 | 부산광역시 | `북구` |
| **4** | **남양성원1차아파트** | **창원시** | **`성산구`** ← 창부레터의 `hotArea` |
| 5 | e편한세상 송도 더퍼스트비치 | 부산광역시 | `서구` |
| 6 | 사직쌍용예가 | 부산광역시 | `동래구` |

원인: `getActiveSggCodes` 가 활성 지역 **38개 전부**를 돌려준다(부산 16개는 `실거래이야기` 확장분).
TOP3 가 전부 부산이므로 **창부레터가 필터 없이 1위를 쓰면 `hotArea` 가 "동래구" 가 된다.**

📌 표기 정정: 실제 `canonical_name` 은 `동래래미안아이파크아파트` 다(접미 "아파트" 포함).

### 창부레터 인계 사항 3건 (ROADMAP 에도 기록)

1. 🔴 **`rank_type='price_change'` 는 사용 전 `si in ('창원시','김해시')` 로 필터할 것.**
   `hotArea` 는 **전역 1위가 아니라 필터 후 최상위 행의 `metadata.region`** 이다
   (현재 데이터 기준 `성산구`).
2. **`getRankingsByType()` 은 `metadata.region` 을 노출하지 않는다** (실측 확인:
   `src/lib/data/rankings.ts:27-63` — `metadata` 를 select 하지만 `RankingRow` 로는
   `area_m2` 만 꺼낸다). 창부레터는 `complex_rankings.metadata` 를 직접 읽거나
   이 함수를 확장해야 한다. 이 함수는 `si`/`gu` 필터도 하지 않는다.
3. **stale 행이 섞일 수 있다** — 집계 경로는 `upsert` 뿐이고 **prune/delete 가 없다**
   (`rankings.ts:416-417`). top-N 에서 빠진 단지의 행은 옛 `rank`·`computed_at` 그대로 남는데
   `getRankingsByType` 에는 **`computed_at` 필터가 없다.** 구조적 위험이며,
   현재 22행은 전부 `computed_at = 2026-08-03` 이라 실제 stale 행은 **0건**이다.

---

## 계획 대비 편차

### [보고 전용] 플랜 acceptance 2건이 실측과 어긋난다 — 고치지 않고 기록

1. **`grep -c -- "--persist" == 1` → 실측 2.** 플랜이 지시한 주석 본문에 `--persist` 가
   들어 있어서다. 실행 줄은 1건. 워크플로 동작에는 영향 없다.
2. **`git status --porcelain card-news/output/` 빈 출력 → 공허한 검사.** 해당 경로는
   `card-news/.gitignore:1` 로 무시되고 추적 파일이 0개라 항상 빈 출력이다. mtime·파일 수
   기반 대체 증거를 남겼다(위 표).

### [Rule 2 - 누락된 필수 검증] 값 차이의 원인을 추측 대신 측정

플랜은 "원인 후보 3가지를 함께 적는다"고만 했다. 후보를 나열만 하면 어느 것이 실제
원인인지 알 수 없어 B-1 판단 근거가 되지 못한다. → `created_at`·`cancel_date`·`superseded_by`
를 직접 조회해 **3번(지연 신고) 단독**임을 확정하고, 코드 드리프트 가능성도 `git diff` 로
배제했다. 코드 변경 0건.

### [Rule 4 → 승인 후 반영] Task 2 의 부작용 → B-4 코드 변경

cron 은 `--series` 없이 돌아 매주 18행을 적재하게 된다. 플랜 범위 밖이고 사용자 정책
결정이라 **먼저 묻고**, 승인(`city-overall` 만) 후 `--persist-series` 를 신설해 반영했다
(커밋 `3bbabb9`). 플랜에 없던 4번째 파일 변경이지만, **배포 전에 들어가지 않으면 사용자가
방금 거부한 동작이 다음 크론 실행에서 그대로 일어난다** — 오늘이 월요일이라 시간 여유가 없었다.

---

## 미검증 / 한계

1. **`2026-05` 는 끝까지 대조되지 않았다.** HTML 0개 → 텍스트 원본 없음. PNG 4개를 사람이
   눈으로 봐야 한다. **"일치" 라고 쓰지 않았다.**
2. **`2026-W24` 의 18시리즈 중 값 대조를 한 것은 3개뿐이다** (HTML 이 있는 것이 3개뿐).
   나머지 15개 시리즈의 재생성 값은 **원본과 대조되지 않았다.** W25 1개를 합쳐 총 4/20 시리즈만
   검증됐다 — **20행 중 16행은 원본 대조 없이 적재된 상태다.**
3. **발행 시리즈 목록의 권위 부족.** `card-news/output/` 이 gitignore 라 이 PC 로컬 파일이
   유일 근거다. Actions artifact 는 30일 retention 으로 만료됐다.
4. **웹에서 실제로 보이는지 확인하지 않았다.** RLS(`status='published' and published_at <= now()`)와
   값의 정합만 확인했다. anon 키 조회나 창부레터 화면 렌더는 하지 않았다.
5. **배포하지 않았다.** 워크플로 변경은 커밋만 됐다. `--persist` 가 Actions 환경에서 실제로
   `contents` 에 쓰는지는 **실행된 적이 없다** — 로컬 실행으로만 검증됐다.
6. **라이브 onConflict 게이트는 이번에 재실행하지 않았다** (40-03 에서 34/34 ok 확인).
   이 plan 은 upsert 코드를 변경하지 않았다.
7. **대량 적재 성능·부분 실패 거동**: 18행 동시 upsert 가 성공했다는 것만 확인했고,
   중간 실패 시 롤백 거동은 측정하지 않았다.

---

## 이월 항목 (7건)

1. **배포 완료** (이월 해소) — 사용자가 직접 push. `origin/main` = `34b13ac`, B-4 수정 포함.
   주간 자동 적재는 **2026-08-10(월) 00:10 KST 부터** `city-overall` 1건으로 시작된다.
   `.planning/` 문서 커밋 `8802d34` 만 미푸시.
   다음 월요일 00:10 KST 실행분은 `contents` 에 적재되지 않는다. 40-02 의 `price_change`
   크론도 동일. → B-3.
2. **`region_tags` 미입력** — 20행 전부 `[]`. SPEC-002 C절 초기 태그 목록 미결(40-03 이월).
3. **`renderHighlightPreview` 에 `subLine` 미적용** (40-01 이월).
4. **card-news 테스트 4종이 루트 `npm run test` 에 잡히지 않는다** (vitest `include: src/**`).
   `build-slides`·`templates-golden`·`templates`·`persist-contents` 전부 수동 실행. CI 편입은 사용자 판단.
5. **라이브 onConflict 게이트는 CI 에서 영구 skip** — `ci.yml` unit-test 잡에 `env:` 블록이
   없어 `TEST_SUPABASE_SKEY` 미주입 (Phase 39 와 동일 한계).
6. **`card-news/.github/workflows/weekly-generate.yml` 죽은 사본** — 경고 3줄만 추가했다.
   삭제 여부는 사용자 판단.
7. **창부레터가 소비할 조회 계약 미문서화** — `contents` 목록·상세 쿼리 형태(정렬 키, 페이지네이션,
   `slides` 파싱 규약)가 어디에도 적혀 있지 않다. 창부레터 부트스트랩 시 필요.

**(해소) 8. cron 의 18시리즈 일괄 적재** — B-4 로 결정·구현 완료 (`--persist-series=city-overall`, 커밋 `3bbabb9`). 이월 아님.

**(신규 이월) 9. 🔴 창부레터 `price_change` 읽기 계약** — B-5. 창부레터는
`rank_type='price_change'` 를 `si in ('창원시','김해시')` 로 **반드시 필터**해야 한다
(전국 22행 중 부산 12행, TOP3 전부 부산). `hotArea` 는 필터 후 최상위 행의 `metadata.region`.
ROADMAP Phase 40 항목에도 기록했다.

**(신규 이월) 10. `getRankingsByType` 이 `metadata.region` 미노출 + `computed_at` 필터 없음** —
B-5 실측. 창부레터가 `metadata` 를 직접 읽거나 함수 확장이 필요하고, prune 이 없어 stale 행이
섞일 수 있다(현재 실측 0건).

---

## Self-Check: PASSED

**파일 실재**
- `.planning/phases/40-changbuletter-prereq/40-04-SUMMARY.md` — FOUND
- `.github/workflows/weekly-generate.yml` — FOUND (`--persist` 실행 줄 `:67`)
- `card-news/.github/workflows/weekly-generate.yml` — FOUND (경고 3줄 `:1-3`)

**커밋 실재**
- `59af356` feat(card-news): 주간 자동 생성 시 contents 적재 (--persist) + 미실행 워크플로 사본 경고 — FOUND

**DB 상태**
- `public.contents` — 20행 / distinct_slug 20 / 95 슬라이드 전부 4필드
- 회차별 행 수 1 / 18 / 1 == 디렉터리 수 — 초과 0건

**작업 트리**
- `git status --porcelain` → ` M supabase/.temp/cli-latest` (plan 시작 전부터 존재)
- `git status --porcelain supabase/migrations/` → 빈 출력 (마이그레이션 0건)
- `card-news/output/` mtime·파일 수 무변경 (gitignore 라 git status 로는 확인 불가)
- `git push` **실행자 미실행** — 사용자가 직접 push (`origin/main` = `34b13ac`, 코드 커밋 2건 포함).
  `.planning/` 문서 커밋만 미푸시
