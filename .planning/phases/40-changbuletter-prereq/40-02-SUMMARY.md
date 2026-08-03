---
phase: 40-changbuletter-prereq
plan: 02
subsystem: rankings-batch
tags: [changbuletter, rankings, price_change, migration, cron]
requires:
  - public.complex_rankings
  - public.transactions
  - public.complexes
provides:
  - "rank_type='price_change' (complex_rankings)"
  - "aggregatePriceChange (src/lib/data/rankings.ts)"
  - "metadata.region — 창부레터 hotArea 근사"
affects:
  - src/lib/data/rankings.ts
  - src/components/home/RankingTabs.tsx
  - src/app/api/cron/rankings (동작만, 코드 무변경)
tech-stack:
  added: []
  patterns: [supabase-upsert-onconflict, aggregator-array, tdd]
key-files:
  created:
    - supabase/migrations/20260803000001_complex_rankings_price_change.sql
    - src/__tests__/rankings-price-change.test.ts
    - scripts/measure-rankings.ts
  modified:
    - src/lib/data/rankings.ts
    - src/__tests__/rankings.test.ts
    - src/components/home/RankingTabs.tsx
decisions:
  - "최소 거래 건수 임계 = 3 (양쪽 창 모두) — compute_gap_stats · fetch-data.js 선례"
  - "metadata.region 을 1위뿐 아니라 전 행에 넣는다 (조회 1회로 동일 비용)"
  - "마이그레이션 버전 20260731000001 → 20260803000001 (기존 적용본과 충돌)"
  - "RankType 확장 파급은 HomeRankType(Exclude) 으로 흡수 — 홈 탭 UI 무변경"
metrics:
  duration: "약 75분"
  completed: 2026-08-03
  tasks: 3
  commits: 3
---

# Phase 40 Plan 02: rank_type='price_change' 랭킹 배치 Summary

`complex_rankings` 에 5번째 rank_type `price_change` 를 신설하고, 기존 시간당 랭킹 크론에
현재 30일 창 대 직전 30일 창의 단지별 평균가 비교 aggregator 를 얹었다. 창부레터 홈 히어로의
`riseRank`·`avgRise`·`hotArea` 가 소비할 데이터가 프로덕션에 실재한다.

**PRE_40_02_SHA = `4e285a8aea646a5fea889fd001a7ec253a7e79c6`** (Task 1 커밋 직전 HEAD)

## 커밋

| Task | Commit | 내용 |
|---|---|---|
| 1 | `0c1fe26` | CHECK 제약 4종 → 5종 마이그레이션 |
| 2 | `50bcffb` | aggregatePriceChange + 테스트 17건 + 목 화이트리스트 |
| 3 | `cd89fb6` | 소요시간 실측 스크립트 |

⛔ `git push` 미실행.

---

## Task 1 — CHECK 제약 확장

### 적용 **전** `pg_constraint` 조회 (`npx supabase db query --linked`)

```
conname                          | pg_get_constraintdef
---------------------------------+------------------------------------------------------------
complex_rankings_rank_check      | CHECK ((rank >= 1))
complex_rankings_rank_type_check | CHECK ((rank_type = ANY (ARRAY['high_price'::text,
                                   'volume'::text, 'price_per_pyeong'::text, 'interest'::text])))
```
→ 플래너 실측과 일치. `rank >= 1` CHECK 는 건드리지 않았다.

### 🔴 편차 1 — 마이그레이션 파일명 버전 충돌 (Rule 3, 자동 수정)

plan 이 지정한 `20260731000001_complex_rankings_price_change.sql` 로 `npm run db:push` 하자:

```
Found local migration files to be inserted before the last migration on remote database.
Rerun the command with --include-all flag to apply these migrations:
supabase\migrations\20260731000001_transactions_complex_price_idx.sql
```

**원인**: 버전 `20260731000001` 은 이미 `20260731000001_transactions_complex_price_idx.sql`
(CREATE INDEX CONCURRENTLY, 별도 경로 적용 후 `migration repair` 된 건 — MEMORY 의
"CONCURRENTLY 는 db push 불가" 선례) 가 점유하고 있고 원장에 remote 로 기록돼 있다.
`migration list` 에 같은 버전이 두 줄(`remote` 있음 / `remote` 빈 값)로 나타났다.

**조치**: 파일명을 `20260803000001_complex_rankings_price_change.sql` 로 변경했다
(현재 최신 remote `20260731170000` 이후로 정렬). 파일 내용은 무변경.
⛔ `--include-all` 로 우회하지 않았다 — 중복 버전을 원장에 밀어 넣는 것이 drift 의 원인이 된다.

### 적용

```
$ npm run db:push
Applying migration 20260803000001_complex_rankings_price_change.sql...
Finished supabase db push.
```

### 적용 **후** `pg_constraint` 조회

```
CHECK ((rank_type = ANY (ARRAY['high_price'::text, 'volume'::text,
        'price_per_pyeong'::text, 'interest'::text, 'price_change'::text])))
```
→ 5종 확인. **SC1 충족.**

### 마이그레이션 원장

```
migrations 총 152건 · unapplied(local only) 0 · missing-file(remote only) 0
```
→ **0/0, drift 없음.**

`execute_sql` · MCP `apply_migration` · 대시보드 **전부 미사용**. 모든 raw SQL 은
`npx supabase db query --linked` 로만 실행했다.

---

## Task 2 — aggregatePriceChange (TDD)

### 목 화이트리스트 선수정 (error-notes #001 재발 방지)

`src/__tests__/rankings.test.ts:35`
```diff
+  // lt/lte: aggregatePriceChange 의 직전 창 필터용 (error-notes #001 재발 방지)
-  const methods = ['select', 'eq', 'is', 'in', 'not', 'gt', 'gte', 'order', 'limit']
+  const methods = ['select', 'eq', 'is', 'in', 'not', 'gt', 'gte', 'lt', 'lte', 'order', 'limit']
```

### RED

```
Test Files  1 failed (1)
     Tests  13 failed | 4 passed (17)
```
통과한 4건은 "제외돼야 한다"를 단언하는 케이스 4·5·6·13 이다 — 기능이 없으면 **공허하게**
통과한다. 실질 단언 13건이 전부 실패했다.

### GREEN

```
✓ src/__tests__/rankings.test.ts (6 tests)
✓ src/__tests__/rankings-price-change.test.ts (17 tests)
Test Files  2 passed (2)
     Tests  23 passed (23)
```

### 🔴 편차 2 — plan 의 목 스캐폴드가 거짓 통과를 만든다 (Rule 1, 자동 수정)

plan 은 `transactions` 단일 chain 에 `mockResolvedValueOnce` 2개를 걸라고 했다.
**그대로 쓸 수 없다** — `aggregateHighPrice`·`aggregateVolume`·`aggregatePricePerPyeong` 도
같은 테이블을 조회하므로:

1. 앞선 3개 aggregator 가 `Once` 값 2개를 먼저 소비하고, 4번째 `.limit()` 이 `undefined` 를
   반환해 구조분해에서 `TypeError` 로 터진다.
2. 더 나쁜 것 — **케이스 1이 거짓 통과한다.** 단일 chain 이면 `.is('cancel_date', null)` 이
   기존 aggregator 호출로 이미 기록돼 있어, `aggregatePriceChange` 에 필터가 **없어도**
   단언이 초록으로 뜬다. SC7 의 증거가 통째로 무효가 된다.

**대체 구현**: `.from('transactions')` 호출마다 **새 chain** 을 주고, 어느 창인지는 호출
순서가 아니라 **내용**(`.select()` 인자 == `'complex_id, price'`, `.lt()` 사용 여부)으로
판별한다. 이 때문에 `grep -c "mockResolvedValueOnce"` ≥ 2 라는 수용 기준은 충족하지 못하지만,
그 기준이 겨냥한 위험(두 창이 같은 데이터를 받아 등락률이 항상 0%)은 **더 강하게** 차단된다.
케이스 7(+10)·8(−10) 양방향 단언도 그대로 유지했다.

### SC7 증거 — 취소·정정 필터 단언 (테스트 케이스 1)

```ts
it('1. 🔴 두 창 모두 취소·정정 거래를 배제한다 (cancel_date / superseded_by)', async () => {
  const { h } = await run({ ... })

  for (const chain of [h.curChain(), h.prevChain()]) {
    expect(chain['is']).toHaveBeenCalledWith('cancel_date', null)
    expect(chain['is']).toHaveBeenCalledWith('superseded_by', null)
  }
})
```
`curChain()`/`prevChain()` 은 price_change 전용 chain 을 내용으로 골라내며, 정확히 1개를
찾지 못하면 throw 한다 — 기존 aggregator 의 호출로는 만족될 수 없다.

코드 쪽 (`src/lib/data/rankings.ts` `fetchPriceWindow`):
```ts
    .select('complex_id, price')
    // 🔴 취소·정정 거래 배제 — ADR-003 · CLAUDE.md · Scope Fence 5. 누락하면 등락률이 오염된다
    .is('cancel_date', null)
    .is('superseded_by', null)
```
**SC3/SC7 충족 (코드 + 테스트 양쪽).**

### 🔴 편차 3 — `RankType` 확장의 타입 파급 (Rule 3, 자동 수정)

`RankType` 에 `'price_change'` 를 더하자 `tsc` 가 2건 실패했다:
```
src/app/page.tsx(109,20): error TS2741: Property 'price_change' is missing in type
  '{ high_price: ...; volume: ...; price_per_pyeong: ...; interest: ...; }'
  but required in type 'Record<RankType, RankingRow[]>'.
src/components/home/RankingTabs.tsx(13,7): error TS2741: Property 'price_change' is missing ...
```
`price_change` 는 창부레터 전용 배치 산출물이라 **bds 홈 탭에 노출하면 안 된다**.
`RankingTabs.tsx` 안에서만 좁혔다:
```ts
type HomeRankType = Exclude<RankType, 'price_change'>
```
`page.tsx` 는 무변경(객체 리터럴이 좁아진 타입을 그대로 만족). 홈 UI 렌더 결과 무변경.

### 수용 기준 실측

| 항목 | 값 |
|---|---|
| `grep -c superseded_by src/lib/data/rankings.ts` | **4** (변경 전 3 → 신규 `fetchPriceWindow` 1개 추가. 두 창이 공통 헬퍼를 공유하므로 +1) |
| `grep -c price_change_30d src/lib/data/rankings.ts` | **0** (Scope Fence 6) |
| `grep -c "'lt', 'lte'" src/__tests__/rankings.test.ts` | **1** |
| `git diff HEAD -- rankings.ts \| grep -c onConflict` | **0** — `onConflict` 문자열 무변경 |
| `aggregators` 배열 길이 | 5, 기존 4종 엔트리 문자 그대로 |
| 기존 4종 함수 본문 diff | 없음 (`git diff PRE..HEAD` 에 `+async function aggregatePriceChange` 만 신규) |
| `route.ts` | **무변경** (`git status` 무출력) |
| 새 RPC | 0개 |
| `npm run lint` | **exit 0** |

### `rankings.test.ts` 단언 1건 수정 (불가피)

기존 `expect(results).toHaveLength(4)` 는 aggregator 가 5개가 되면 반드시 깨진다.
plan 은 "이 파일의 다른 부분을 손대지 않는다"와 "rankings.test.ts 전부 통과"를 동시에
요구하는데 양립 불가라, 후자(회귀 금지)를 택해 `4 → 5` 로 갱신하고 테스트 이름도 맞췄다.
그 외 이 파일은 무변경.

---

## Task 3 — 라이브 실행 · 실측 · 회귀

### 실행 **전** `complex_rankings` 스냅샷 (2026-08-03 01:27 프로덕션 크론 산출)

| rank_type | n | min_score | max_score |
|---|---|---|---|
| high_price | 199 | 22000 | 163000 |
| volume | 292 | 1 | 39 |
| price_per_pyeong | 202 | 930 | 4441 |
| interest | 1 | 4 | 4 |
| **price_change** | **0** (제약이 막고 있었음) | — | — |

### 실행 **후**

| rank_type | n | min_score | max_score | latest computed_at |
|---|---|---|---|---|
| high_price | 279 | 22000 | 220000 | 2026-08-03 04:09:34 |
| volume | 361 | 1 | 39 | 2026-08-03 04:09:34 |
| price_per_pyeong | 283 | 930 | 5732 | 2026-08-03 04:09:34 |
| interest | 1 | 4 | 4 | 2026-08-03 01:27:08 |
| **price_change** | **22** | **-48.7** | **59** | 2026-08-03 04:09:34 |

→ **SC2/SC6 충족**: `rank_type='price_change'` 행 22건 실재.

**기존 4종 급감 없음** — 오히려 증가했다. 원인은 이 배치의 **기존 동작**이다:
upsert 만 하고 top-100 밖으로 밀려난 행을 **지우지 않는다**. `computed_at` 별로 쪼개보면
`high_price` 는 01:27(프로덕션) 잔여 80행 + 그 이전 주간의 1~2행 꼬리가 그대로 남아 있다.
내 실행이 갱신한 것은 각 타입 최신 100행이다. 데이터 손실 0건.

`interest` 가 0건 upsert 된 것은 **BEFORE 실행(구 코드)에서도 동일**했다 →
`favorites`(site_id='danjiondo') 데이터 변화이지 이번 변경의 영향이 아니다.
기존 행 1건은 그대로 보존됐다.

### SC8 증거 — `price_change` rank 1~5

| rank | score | metadata.region | canonical_name | gu | si | cur_n | prev_n |
|---|---|---|---|---|---|---|---|
| 1 | 59 | **동래구** | 동래래미안아이파크아파트 | **동래구** | 부산광역시 | 3 | 3 |
| 2 | 45.1 | 수영구 | 삼익비치아파트 | 수영구 | 부산광역시 | 3 | 7 |
| 3 | 13.4 | 북구 | 백양디이스트 | 북구 | 부산광역시 | 7 | 4 |
| 4 | 8.7 | 성산구 | 남양성원1차아파트 | 성산구 | 창원시 | 3 | 3 |
| 5 | 8.5 | 서구 | e편한세상 송도 더퍼스트비치 | 서구 | 부산광역시 | 3 | 6 |

→ rank 1 의 `metadata->>'region'` = `'동래구'` = 해당 단지 `gu`. 5행 전부 일치.
**SC4/SC8 충족.**

### 🔴🔴 이월 ⑤ — `price_change` 상위가 **부산**이다 (창부레터 소비 전 결정 필요)

`getActiveSggCodes` 는 `regions.is_active` 전부를 돌려준다. 실측:

```
total_active 38 · 부산 16 · 창원+김해 6 · (나머지 경남 16)
```

부산 16개 구는 **realtrade-story** 가 쓰는 지역이고 `complex_rankings` 는 사이트 구분이 없다.
따라서 창부레터가 `getRankingsByType('price_change')` 를 그대로 쓰면 **hotArea 가 '동래구'**,
`riseRank` 상위도 부산 단지가 된다 — 창원·김해 레터로서는 틀린 값이다.

이건 **기존 4종도 동일한 성질**이고(그래서 `high_price` max 가 22억이다), 지역 범위를 좁히는
것은 랭킹 배치 전체에 사이트 스코핑을 도입하는 구조 변경이라 이 plan 범위 밖이다
(Scope Fence 10 · 편차 Rule 4). **사용자 판단 필요** — 선택지:
① 창부레터가 소비 시 `si in ('창원시','김해시')` 로 필터 ②`price_change` 만 지역 한정 aggregator
③ 랭킹 전체에 site 스코프 도입.

### SC9 — 소요시간 (4종 구분)

| # | 구분 | 값 |
|---|---|---|
| ① | **프로덕션 BEFORE** (`ingest_runs` 최근 24회) | min **5.145** / median **6.055** / avg **6.138** / max **7.655** s |
| ①-b | **프로덕션 BEFORE 전 이력** (814회, 2026-05-19~) | min 2.735 / p95 **7.661** / p99 **8.443** / max **17.589** s · **실패 0건** |
| ② | **로컬 BEFORE** (4종, PRE 코드, 3회) | 3.664 / 3.089 / 2.400 s → median **3.089** |
| ③ | **로컬 AFTER** (5종, 4회) | 7.186 / 5.304 / 3.631 / 3.553 s → median **4.468** |
| ④ | **프로덕션 AFTER** | 🔴 **미확인 (배포 후 `ingest_runs` 재조회로만 가능)** |

**추정 증가분 (②→③, "추정"이며 로컬 측정은 하한이다)**: median 기준 **+1.379 s**,
워밍업 제외 비교(②의 3.089·2.400 vs ③의 3.631·3.553) 기준 **+0.847 s**.
`aggregatePriceChange` 자체 `ms` 실측: **835 / 861 / 1570 / 1859 ms** (워밍 후 ~850ms).

**타입별 `ms`** (로컬 AFTER 1회차):

| type | upserted | ms | truncated |
|---|---|---|---|
| high_price | 100 | 2134 | false |
| volume | 100 | 1108 | false |
| price_per_pyeong | 100 | 686 | false |
| interest | 0 | 244 | false |
| **price_change** | **22** | **1570** | **false** |

wall-clock 7186 ms / aggregator 합계 5742 ms.

**실행 빈도와 상한**
- 🔴 이 크론은 **하루 24회** 돈다 (`.github/workflows/rankings-cron.yml` `cron: '0 * * * *'`).
  추가 비용은 **5000행 `transactions` 조회 × 2창 × 24회/일 = 48 쿼리/일**.
  두 창은 `Promise.all` 병렬이라 벽시계로는 1창분에 가깝다.
- **상한 ①: Vercel 함수 타임아웃** — `route.ts` 에 `maxDuration` 선언이 없다(프로젝트 기본값).
  🔴 **실측으로 10초 가설은 기각된다**: 814회 중 **10초 초과 4회, 15초 초과 3회, 최대 17.589초**가
  전부 `status='success'` 로 완료됐고 `'running'` 으로 멈춘 행이 **0건**이다.
  → 이 라우트의 실제 상한은 **≥ 17.589초**다 (정확한 값은 미확인).
- **상한 ②: GH Actions `timeout-minutes: 3`** (180초) — 구속력 없음.

**판정**: p95 7.661s + 추정 0.85~1.4s ≈ **8.5~9.1s**, p99 8.443s → **9.3~9.8s**.
실증된 상한 ≥17.589s 대비 여유가 있다. 다만 전 이력 최대 17.589s 에 같은 증가분이 실리면
**18.4~19.5s** 가 되고, 이는 실증된 상한 바로 위다 — **꼬리 구간은 미검증**이다.
`curl -sSf` 라 초과 시 GH Actions job 이 빨갛게 실패하므로 조용한 실패는 아니다.

🔴 **배포 전 권고(사용자 결정)**: `route.ts` 에 `export const maxDuration = 60` 을 선언하면
불확실성이 사라진다. 이 plan 은 `route.ts` 무변경을 수용 기준으로 못박아 두었으므로
**여기서 임의로 추가하지 않았다.**

`truncated` = **false** (4회 실행 전부). 두 창 모두 5000행 상한에 닿지 않았다.

### 회귀 측정 — SHA 되돌리기 (⛔ `git stash` 미사용)

`PRE=4e285a8aea646a5fea889fd001a7ec253a7e79c6`, `AFTER=$(git rev-parse HEAD)`

**양성 신호 2건** (BEFORE 상태 확인):
```
$ git diff --stat $PRE -- src/
                                   ← 빈 출력
$ grep -c "aggregatePriceChange" src/lib/data/rankings.ts
0
```
신규 테스트 파일은 `mv src/__tests__/rankings-price-change.test.ts /tmp/p40-02-newtest.ts` 로
격리했다 (`git checkout <sha> -- <path>` 는 그 커밋에 없던 파일을 지우지 않는다).
복원 후 `git status --porcelain src/` **빈 출력** 확인.

| | Test Files | Tests |
|---|---|---|
| BEFORE | 6 failed / 98 passed (104) | **17 failed / 658 passed / 2 skipped (677)** |
| AFTER | 6 failed / 99 passed (105) | **17 failed / 675 passed / 2 skipped (694)** |

증분은 **+17 passed = 신규 테스트 파일 17건**뿐. 실패 수 불변.

**실패 이름 집합 비교** (총계 비교 아님):
```
$ diff /tmp/p40-02-before.txt /tmp/p40-02-after.txt && echo "FAILSET_UNCHANGED"
FAILSET_UNCHANGED
```
- `/tmp/p40-02-before.txt` — 34행
- `/tmp/p40-02-after.txt` — 34행
  (17개 실패 테스트 × `×` 라인 + `FAIL` 라인 각 1건. ANSI 이스케이프를 `sed` 로 제거한 뒤 추출)

실패 17건은 전부 사전 존재 실패이며 **로컬 DB 의존 통합 테스트 6파일**이다:
`complex-matching-3b` 4건 / `favorites` 3건 / `molit-ingest` 3건 / `reviews` 3건 /
`school-ranking-regional` 1건 / `seed-region` 3건.
→ **회귀 0건. SC11(이름 집합 기준) 충족.**

### 최종 검증

```
npm run lint                      → exit 0
npx supabase migration list --linked → unapplied 0 / missing-file 0 (총 152건)
```

---

## Deviations from Plan

### 자동 수정 (Rule 1·3)

**1. [Rule 3 - 블로커] 마이그레이션 파일명 버전 충돌**
- **발견 시점**: Task 1, `npm run db:push`
- **문제**: plan 지정 버전 `20260731000001` 이 이미 적용·repair 된
  `20260731000001_transactions_complex_price_idx.sql` 과 충돌
- **조치**: `20260803000001_complex_rankings_price_change.sql` 로 개명 (내용 무변경).
  `--include-all` 우회 안 함
- **커밋**: `0c1fe26`

**2. [Rule 1 - 버그] plan 의 테스트 목 스캐폴드가 거짓 통과를 만든다**
- **발견 시점**: Task 2 설계
- **문제**: 단일 `transactions` chain + `mockResolvedValueOnce` 2개 방식은 ① 기존 3개
  aggregator 가 값을 먼저 소비해 `TypeError` ② 케이스 1(취소·정정 단언)이 기존 aggregator
  호출로 **거짓 통과**
- **조치**: `.from('transactions')` 호출마다 새 chain + 내용 기반(`select` 인자·`lt` 사용
  여부) 창 판별. 수용 기준 `grep -c mockResolvedValueOnce >= 2` 는 **미충족**이나 그 기준이
  막으려던 위험은 더 강하게 차단
- **커밋**: `50bcffb`

**3. [Rule 3 - 블로커] `RankType` 확장의 tsc 파급 2건**
- **발견 시점**: Task 2, `npm run lint`
- **문제**: `Record<RankType, …>` 소비처(`page.tsx`, `RankingTabs.tsx`)가 TS2741
- **조치**: `RankingTabs.tsx` 에 `type HomeRankType = Exclude<RankType, 'price_change'>`.
  홈 탭 UI 무변경, `page.tsx` 무변경
- **커밋**: `50bcffb`

**4. [Rule 3 - 블로커] `rankings.test.ts` 의 `toHaveLength(4)`**
- **문제**: aggregator 5개가 되면 필연적으로 깨짐. plan 의 "이 파일 무수정"과
  "이 파일 전부 통과"가 양립 불가
- **조치**: 해당 단언만 `4 → 5`, 테스트 이름 동기화. 그 외 무변경
- **커밋**: `50bcffb`

**5. [Rule 3 - 블로커] `measure-rankings.ts` 의 `server-only` 마커**
- **문제**: `rankings.ts` 1행이 `import 'server-only'` 라 tsx 스크립트에서 throw
- **조치**: `npx tsx --conditions=react-server` 로 실행 (패키지 exports 조건 해석).
  `rankings.ts` 에서 마커를 **떼지 않았다** — 안전장치를 훼손하는 대신 실행 조건으로 해결
- **커밋**: `cd89fb6`

### 사용자 결정 필요 (Rule 4 — 미실행)

- **`price_change` 지역 범위** (위 "이월 ⑤"). 랭킹 배치 전체의 사이트 스코핑 문제라 자동 수정하지 않았다.

## Known Stubs

없음. `price_change` 는 프로덕션 데이터로 채워졌고 하드코딩·플레이스홀더가 없다.

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 신설이 없다. 마이그레이션은 CHECK 허용값
확장 1건(권한·RLS 무관)이고, 신규 의존성 0건이다.

---

## 이월 항목

**① 🔴 미배포**
미배포 상태다. `rankings` 크론은 `.github/workflows/rankings-cron.yml` 의
`cron: '0 * * * *'` 로 **매시 정각** 돌지만, 배포 전까지 그 실행은 **4종 코드**다.
따라서 이번에 수동 실행으로 만든 `price_change` 행은 갱신되지 않고 그대로 남는다.

**①-b 프로덕션 AFTER 소요시간 미확인**
배포 후 `ingest_runs`(`source_id='rankings'`) 재조회로만 얻을 수 있다.
함께 볼 것: `route.ts` 에 `maxDuration` 선언 여부 결정 (위 SC9 권고).

**② `hotArea` 는 MVP 근사다**
40-CONTEXT D-05 확정안 = "등락률 1위 단지의 지역명". 지역 단위 집계가 아니다.
`changbuletter/docs/adr/ADR-005` §2 의 "미결" 표기 갱신은 크로스 레포라 이 Phase 범위 밖 —
사용자 판단.

**③ 이상치 미필터**
이 aggregator 는 `filterOutliers`(200% 룰)를 적용하지 않는다 — 기존 4종과 동일한 정책이다.
관측된 score 범위: **-48.7 ~ +59** (22행). ±200% 밖 값은 없다. 다만 rank 1(+59%)이
`cur_count=3`·`prev_count=3` 이라 임계 최소치이며, 3건 평균은 흔들릴 수 있다.

**④ 창부레터 소비 계약 미문서화**
`getRankingsByType('price_change')` 반환 형태를 이 Phase 에서 문서화하지 않았다.
참고 — `RankingRow` 는 `metadata.area_m2` 만 읽으므로 **`region`·`cur_avg`·`prev_avg`·
`cur_count`·`prev_count` 는 현재 반환되지 않는다.** 창부레터가 `hotArea` 를 쓰려면
`complex_rankings.metadata` 를 직접 읽거나 `getRankingsByType` 를 확장해야 한다.
창부레터 부트스트랩 시 필요.

**⑤ 🔴 `price_change` 상위가 부산 단지다** (위 SC8 절 참조) — 사용자 결정 필요.

**⑥ `complex_rankings` 는 오래된 행을 지우지 않는다**
top-100 밖으로 밀려난 행이 수주간 잔존한다(최대 2026-07-24 잔여 관측). 기존 동작이며
이번 변경과 무관하지만, 창부레터가 `computed_at` 필터 없이 읽으면 **낡은 행을 섞어 읽는다.**
`getRankingsByType` 는 `rank` 오름차순 + `limit` 만 쓰므로 이 위험에 노출돼 있다.

---

## 40-CONTEXT D-04 크론 표 정정 (재확인)

plan 이 정정한 내용을 실측으로 재확인했다:

| 크론 | 정의 위치 | 스케줄(UTC) |
|---|---|---|
| `/api/cron/daily` | `vercel.json` | `0 19 * * *` |
| `/api/cron/cafe-articles` | `vercel.json` | `30 19 * * *` ← 초안이 rankings 로 오인 |
| `/api/cron/rankings` | 🔴 `.github/workflows/rankings-cron.yml` | **`0 * * * *` — 매시, 하루 24회** |

D-04 의 *결론*(rankings 가 `molit-daily` 와 분리돼 ADR-005 요구를 충족)은 유효하다.
틀렸던 것은 스케줄·비용 분석이다. ⛔ `rankings` 에 **야간 1회 배치는 존재하지 않는다** —
다음 실행은 언제나 **매시 정각(UTC 00분)** 이다.

---

## Self-Check: PASSED

파일 실재:
- `supabase/migrations/20260803000001_complex_rankings_price_change.sql` — FOUND
- `src/lib/data/rankings.ts` — FOUND
- `src/__tests__/rankings-price-change.test.ts` — FOUND
- `src/__tests__/rankings.test.ts` — FOUND
- `src/components/home/RankingTabs.tsx` — FOUND
- `scripts/measure-rankings.ts` — FOUND

커밋 실재: `0c1fe26` FOUND · `50bcffb` FOUND · `cd89fb6` FOUND

⚠️ `supabase/.temp/cli-latest` 가 modified 상태로 남아 있다 — **세션 시작 시점부터 dirty 였던
사전 존재 변경**(Supabase CLI 버전 캐시)이며 이 plan 과 무관해 손대지 않았다.
그 때문에 `git status --porcelain supabase/` 는 비지 않는다.
