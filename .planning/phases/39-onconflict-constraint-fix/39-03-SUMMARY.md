---
phase: 39-onconflict-constraint-fix
plan: 03
subsystem: db-regression-gate
requirements: [F-05]
date: 2026-07-31
status: complete
key-files:
  created:
    - supabase/migrations/20260731170000_unique_indexes_for_table_fn.sql
    - src/lib/db/onconflict-audit.ts
    - src/lib/db/onconflict-audit.test.ts
    - src/__tests__/onconflict-constraint-gate.test.ts
  modified:
    - CLAUDE.md
commits:
  - 7ba0d76  feat(db) unique_indexes_for_table 카탈로그 RPC
  - ba7f327  feat(db) onconflict-audit 모듈 + 단위 테스트
  - 98e4f4c  feat(db) 라이브 대조 게이트 + CLAUDE.md 규약
---

# Phase 39 Plan 03: onConflict 회귀 게이트 (F-05) Summary

`.upsert(…, { onConflict })` 지점을 `src/`에서 정적 수집해 실제 UNIQUE 인덱스 카탈로그와
대조하는 2층 게이트. **부분 인덱스는 절대 "일치"로 판정되지 않으며, 그 단언은 DB 없이 항상 실행된다.**

## 계획 대비 변경 (39-03-PLAN.md는 F-02 변경 이후 stale)

| 항목 | 계획 | 실제 |
|---|---|---|
| 마이그레이션 | 0개 (39-02가 RPC 생성 전제) | **1개 추가.** 39-02 Task 1의 RPC는 프로덕션에 존재하지 않았다 (`pg_proc` 0행 실측) → 이 plan에서 생성 |
| `favorites` 인덱스 | 39-02가 부분 인덱스 2개 DROP | **DROP되지 않았다.** F-02는 upsert 제거 + `site_id` 필터로 해결됐고 부분 인덱스 2개는 유지된다 → 음성 대조 픽스처가 *현재* 프로덕션 실측값이 됐다 |
| 수집 건수 하한 | ≥17 | **≥16.** F-02·F-03이 upsert를 각 1건씩 제거해 18−2=16. 실측도 정확히 16 |
| 단위 테스트 수 | 12 | **20** (주석 오탐 방지·상위집합·자기참조·마이그레이션 존재 단언 추가) |
| skip 조건 | `!SKEY` | `!SKEY` **+ 게이트 전제 부재**(아래 참조) |

## 실측 수집 결과 — 16건 / distinct 15테이블

```
src/app/actions/kakao-channel-actions.ts:40   kakao_channel_subscriptions (user_id)
src/app/api/cron/daily/route.ts:151           presale_transactions (area,deal_date,floor,listing_id)
src/app/api/cron/daily/route.ts:189           new_listings (pblanc_no)
src/app/api/cron/daily/route.ts:228           new_listings (pblanc_no)
src/app/api/cron/daily/route.ts:361           facility_kapt (complex_id,data_month)
src/lib/actions/listing-price-actions.ts:75   listing_prices (complex_id,recorded_date,source)
src/lib/actions/redevelopment-actions.ts:77   redevelopment_projects (complex_id)
src/lib/auth/push-actions.ts:21               push_subscriptions (endpoint)
src/lib/auth/realtor-actions.ts:169           realtor_assignments (complex_id,display_order)
src/lib/auth/topic-actions.ts:21              notification_topics (topic,user_id)
src/lib/data/cafe-articles.ts:54              cafe_articles (naver_article_id)
src/lib/data/cafe-posts.ts:75                 cafe_posts (url)
src/lib/data/complex-matching.ts:281          complex_aliases (alias_name,complex_id,source)
src/lib/data/gap-stats.ts:100                 complex_gap_stats (complex_id)
src/lib/data/rankings.ts:251                  complex_rankings (complex_id,rank_type,window_days)
src/lib/data/realprice.ts:64                  transactions (dedupe_key)
```
`table === ''` 0건. 39-02 SUMMARY의 정상 13건 표 + `facility_kapt` + `redevelopment_projects` = 15테이블로 일치.

## 발견·수정한 결함 — 주석 오탐 (계획에 없던 함정)

39-03-PLAN은 *"주석의 `// onConflict — (…)`는 `:` + 따옴표가 없어 매치되지 않는다"*고 단정했지만
**틀렸다.** F-02·F-03이 *왜* upsert를 쓰지 않는지 설명하려고 옛 값을 주석에 그대로 남겼다:

- `src/lib/auth/favorite-actions.ts:33`  `// … 그래서 onConflict: 'user_id,complex_id' 는 …`
- `src/lib/data/new-listings-molit.ts:14` `` * `onConflict: 'name,region'`은 … ``

정규식만으로 수집하면 이 둘이 잡혀 **이미 고쳐진 테이블 2개가 FAIL로 오탐**된다. 오탐 1건이면
게이트 전체가 무시된다. → 오프셋 보존형 `stripComments`(라인·블록 주석 + 문자열/템플릿 리터럴 +
**정규식 리터럴**) 도입.

정규식 리터럴 처리는 실측으로 필요성이 드러났다: `FROM_RE = /\.from\(\s*['"]…['"]\s*\)/g` 의
문자 클래스 안 따옴표가 문자열 시작으로 오인돼 모드가 새고, 그 뒤 자기 자신의 JSDoc이 안 지워져
`src/lib/db/onconflict-audit.ts:205 new_listings (pblanc_no)` 가 17번째 항목으로 수집됐다.
이 회귀는 전용 테스트로 고정했다.

## 음성 대조 3종 — 이 Phase의 핵심 증거

**① 단위 (DB 불필요) — 수정 전 onConflict 값**
```ts
const results = auditSites([site('favorites', 'user_id,complex_id')], {
  favorites: toInferrable(FAVORITES_INDEXES),
})
expect(results[0]!.verdict).toBe('no_matching_index')
```

**② 단위 (DB 불필요) — 컬럼만 맞춘 그럴듯한 오답**
```ts
// 전제 확인: 컬럼 집합이 부분 인덱스와 정확히 동일 — "컬럼만 비교"였다면 반드시 오탐
expect([...(target.columns ?? [])].sort()).toEqual(['complex_id', 'site_id', 'user_id'])
const results = auditSites([site('favorites', 'user_id,complex_id,site_id')], {
  favorites: toInferrable(FAVORITES_INDEXES),
})
expect(results[0]!.verdict).toBe('no_matching_index')
```

**③ 라이브 — RPC가 실제로 부분 인덱스를 구분하는지**
```ts
const rows = await uniqueIndexesFor('new_listings')
const partial = rows.find((r) => r.index_name === 'new_listings_molit_name_region_idx')
expect(partial?.is_partial).toBe(true)
expect(toInferrable(rows).map((i) => i.name)).not.toContain('new_listings_molit_name_region_idx')
```

픽스처는 **2026-07-31 프로덕션 실측값**이다 (부분 인덱스 2개는 지금도 존재):
```
favorites_area_type_alert_unique_idx  {area_type_id,complex_id,site_id,user_id}  is_partial=true
favorites_complex_favorite_unique_idx {complex_id,site_id,user_id}               is_partial=true
favorites_pkey                        {id}                                       is_partial=false
```

## 라이브 게이트 실행 — 실제로 돌렸다 (프로덕션 카탈로그)

```
TEST_SUPABASE_URL=<NEXT_PUBLIC_SUPABASE_URL> TEST_SUPABASE_SKEY=<SUPABASE_SERVICE_ROLE_KEY> \
  npx vitest run src/__tests__/onconflict-constraint-gate.test.ts

✓ src/__tests__/onconflict-constraint-gate.test.ts (2 tests) 2379ms
  ✓ src/ 의 모든 upsert 지점이 추론 가능한 UNIQUE 인덱스와 일치한다  2076ms
  ✓ 🔴 라이브 음성 대조 — new_listings 의 부분 인덱스는 추론 대상에서 제외된다  301ms
Tests  2 passed (2)
```
16개 지점 전부 `verdict === 'ok'`.

**공허하지 않음을 실측 증명** — `redevelopment-actions.ts`의 `onConflict: 'complex_id'`를
일시적으로 `'complex_id,phase'`로 바꾸고 재실행:
```
× src/ 의 모든 upsert 지점이 추론 가능한 UNIQUE 인덱스와 일치한다
| src/lib/actions/redevelopment-actions.ts:77 | redevelopment_projects | complex_id,phase | no_matching_index | - |
```
정확히 그 파일:행을 지목하고 실패했다. 이후 `git checkout --`로 원복 (`git status` 빈 출력 확인).

## 회귀 실측 — 실패 이름 집합 불변

| | failed | passed | skipped | total |
|---|---|---|---|---|
| before (HEAD~3) | 17 | 638 | 0 | 655 |
| after | **17** | 658 | 2 | 677 |

`diff baseline-names.txt after-names.txt` → **차이 0줄 (IDENTICAL FAILING SET)**.
`passed` +20 = 단위 테스트 20건, `skipped` +2 = 라이브 게이트 2건.
사전 실패 17건은 전부 로컬 DB 의존(`favorites`·`complex-matching-3b`·`molit-ingest`·`reviews`·
`school-ranking-regional`·`seed-region`)이며 이 plan과 무관하다.

## skip 조건을 넓힌 이유 (계획과 다름 — 반드시 읽을 것)

`describe.skipIf(!SKEY)`만으로는 **로컬에서 skip되지 않는다.** `.env.test.local`이
`TEST_SUPABASE_SKEY`를 로컬 스택(`http://127.0.0.1:54321`) 키로 채워두기 때문이다.
그 스택은 켜져 있지만 마이그레이션이 안 걸려 있어 `PGRST202`가 나고, 그대로 두면
**사전 실패가 17 → 19로 늘어난다** (Scope Fence 8 위반).

그래서 게이트의 **전제**가 없을 때만 skip한다:
- REST에 닿지 못함 (스택 꺼짐)
- `PGRST202` — `unique_indexes_for_table` 자체가 없음 (마이그레이션 미적용 환경)

그 외 오류와 모든 불일치는 **FAIL**이다. skip은 조용하지 않다 — 사유와 재실행 커맨드를
`console.warn`으로 찍는다. 추가 안전장치로 **단위 테스트(DB 불필요)가 마이그레이션 파일의
존재와 내용(`indpred`·`grant … to service_role`)을 단언**한다 — 파일이 사라지면 게이트가
조용히 skip으로 전락하기 때문이다.

## 🔴 한계 — "재발 방지 완료"라고 쓰지 않는다

`.github/workflows/ci.yml`의 `unit-test` 잡은 `npm run test`를 **`env:` 블록 없이** 실행한다.
`TEST_SUPABASE_SKEY`도 Supabase 서비스도 없고, `setup.env.ts`가 읽는 `.env.test.local`은
untracked라 CI에 존재하지 않는다. → **`onconflict-constraint-gate.test.ts`는 CI에서 영구히 skip된다.**

**CI 편입 또는 훅 설치 전까지 재발 방지는 다음 셋에만 의존한다:**
1. `CLAUDE.md` 규약 (사람이 읽고 지키는 것)
2. `onconflict-audit.test.ts` 20건 (CI에서 항상 실행 — 부분 인덱스 오판 방지 + 스캐너 건전성.
   **단 실제 DB 제약과의 대조는 아니다**)
3. 대조 게이트의 **수동 실행**

승격 방법(사용자 결정 시): `ci.yml` test 스텝에 `env: TEST_SUPABASE_URL / TEST_SUPABASE_SKEY`를
GitHub Secrets로 주입. **이 Phase에서는 하지 않았다** — CI에 프로덕션 `service_role` 키를 넣는
결정은 사용자 몫이다.

## CLAUDE.md 추가 규약 (`git diff --numstat` = `3 0`, 삭제 0줄)

```
- **CRITICAL** UNIQUE 제약·인덱스를 바꾸는 마이그레이션은 **같은 커밋에서** 해당 테이블의 `.upsert(…, { onConflict: '…' })` 호출부를 함께 갱신한다 (Phase 39 고장 4건이 전부 이 누락에서 나왔다)
  - `onConflict`는 **비부분(non-partial) UNIQUE 인덱스**만 추론할 수 있다. 부분 인덱스(`WHERE …`)를 만들면 컬럼 목록을 어떻게 맞춰도 PostgREST upsert는 `42P10`으로 실패한다 → 그 테이블은 upsert 대신 명시적 select→insert/update를 쓴다
  - 검증 2층: ① `src/lib/db/onconflict-audit.test.ts` — **DB 불필요·항상 실행.** 부분 인덱스 오판 방지 + 실물 `src/` 스캐너 건전성 ② `src/__tests__/onconflict-constraint-gate.test.ts` — 실제 카탈로그 대조. **라이브 DB 필요하고 CI에는 자격증명이 없어 skip된다** → `TEST_SUPABASE_URL=… TEST_SUPABASE_SKEY=… npx vitest run src/__tests__/onconflict-constraint-gate.test.ts`로 수동 실행
```

## 마이그레이션 원장

`npm run db:push`로만 적용 (`execute_sql`·MCP `apply_migration`·대시보드 미사용).
`CREATE INDEX CONCURRENTLY` 없음 → `migration repair` 불필요.

```
npx supabase migration list --linked
total: 151 | local-only(미적용): 0 | remote-only(원장고아): 0
last: {"local":"20260731170000","remote":"20260731170000"}
```
`prosecdef = false`, `proacl = {postgres=X/postgres,service_role=X/postgres}` — anon·authenticated 실행 불가 실측 확인.

## 이월 항목

1. **F-05 라이브 대조의 CI 편입 — 사용자 판단.** 위 "한계" 참조. 편입 전까지 자동 실행되지 않는다
2. **로컬 Supabase 스택이 최신 마이그레이션 미적용 상태.** 사전 실패 17건의 원인이며 게이트도
   로컬에서는 skip된다. `npx supabase start && npm run db:reset`으로 해소 가능하나 이 plan 범위 밖
3. **`favorites` 읽기 경로 `site_id` 미필터** (`getFavorites`·`isFavorited` 등) — 39-01 SUMMARY 참조
4. **미배포.** 이 plan의 3개 커밋은 push되지 않았다 (사용자가 배포 담당)

## Self-Check: PASSED

- `supabase/migrations/20260731170000_unique_indexes_for_table_fn.sql` — FOUND
- `src/lib/db/onconflict-audit.ts` — FOUND
- `src/lib/db/onconflict-audit.test.ts` — FOUND
- `src/__tests__/onconflict-constraint-gate.test.ts` — FOUND
- 커밋 `7ba0d76`·`ba7f327`·`98e4f4c` — FOUND
- `npm run lint` exit 0 (ESLint 0 warnings, `tsc --noEmit` 0 errors)
