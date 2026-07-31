# Phase 39: ON CONFLICT 제약 불일치 전수 수정 (upsert 침묵 실패 4건) - Context

**Gathered:** 2026-07-31
**Status:** Ready for planning
**Source:** 프로덕션 Postgres 로그 조사 + 오케스트레이터 라이브 실측

> 🔴 **이 Phase의 모든 판정은 프로덕션에서 실제로 실행해 확인했다.** 추정 없음.
> 판정 방법: `EXPLAIN INSERT ... ON CONFLICT (...)` — ON CONFLICT 추론 실패는 **플래닝 단계
> 에러**라 EXPLAIN만으로 확정 판정이 되고 **데이터는 변경되지 않는다**. 계획·실행 단계에서도
> 이 방법을 판정 수단으로 그대로 쓸 것.

<domain>
## Phase Boundary

**발단**: 2026-07-30 19:47~19:48 프로덕션 로그에 동일 에러 50건.

```
ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

50건은 정확히 당시 K-apt 일배치의 `.limit(50)` 대상 수와 일치했다. 이를 단서로 저장소의
모든 `onConflict` 인자를 실제 UNIQUE 제약과 대조해 **4건의 고장**을 확정했다.

**공통 원인 — 이 Phase의 진짜 주제**:
네 건 모두 **"마이그레이션이 UNIQUE 제약을 바꿨는데 애플리케이션 코드는 그대로 남았다"**이다.
개별 수정만으로는 반드시 재발한다. 따라서 **회귀 방지 게이트(자동 검증 테스트)가 이 Phase의
핵심 산출물**이며, 개별 수정 4건은 그 게이트가 잡아낼 첫 배치다.

**이 Phase가 하는 일**:
1. **F-01** `facility_kapt` — 일배치 K-apt 100% 실패 수정 (앱 1줄)
2. **F-02** `favorites` — 즐겨찾기 추가 불가 수정 (마이그레이션 + 앱)
3. **F-03** `new_listings` — MOLIT 분양권전매 적재 실패 수정 (앱, 에러 확인 포함)
4. **F-04** `redevelopment_projects` — 어드민 재건축 저장 실패 수정 (마이그레이션 + 앱 유지)
5. **F-05** onConflict↔제약 일치 자동 검증 테스트 (재발 방지 게이트)

**이 Phase가 하지 않는 일**:
- gap-stats 성능/인덱스 — **문제가 아님이 실측으로 확정됐다**(아래 baseline 참조)
- Vercel 환경변수(`MOLIT_API_KEY` 등) — 사용자 작업
- `kapt`·`school_alimi` 스케줄 워크플로 신설
- 정상 확인된 13개 upsert 지점 — 건드리지 말 것
- 창부레터 0-4~0-7

</domain>

<decisions>
## Implementation Decisions

### F-01: `facility_kapt` — onConflict만 교체 (마이그레이션 불필요)

| 항목 | 값 |
|---|---|
| 위치 | `src/app/api/cron/daily/route.ts:355` |
| 현재 | `onConflict: 'complex_id'` |
| 실제 제약 | `UNIQUE (complex_id, data_month)` (`facility_kapt_complex_id_data_month_key`) |
| 영향 | 일배치 K-apt 수집 **100% 실패**. `data_sources.kapt.last_status = null` — 한 번도 성공 기록 없음 |

**✅ 수정안 실측 검증 완료**: `onConflict: 'complex_id,data_month'` → EXPLAIN 통과(OK).

**결정**: 코드를 제약에 맞춘다. 제약을 바꾸지 않는다 — `(complex_id, data_month)`는 월별
스냅샷 이력을 남기려는 **의도된 설계**이고, `data_month`는 코드가 이미
`new Date().toISOString().slice(0,7) + '-01'`로 채우고 있다.

⚠️ **현재 `facility_kapt` 3,661행은 전부 수동 스크립트로 적재된 것**이다. 크론이 넣은 게 아니다.

⚠️ **커밋 `b0a4d4f`(2026-07-31)와의 관계**: 그 커밋이 K-apt 대상 선별 순환(`selectKaptTargets`)을
고쳤으나 **쓰기가 100% 실패하므로 아직 아무 효과가 없다.** F-01이 고쳐져야 비로소 동작한다.
두 수정은 짝이다.

### F-02: `favorites` — `NULLS NOT DISTINCT` 단일 제약으로 통합 🔴 사용자 노출

| 항목 | 값 |
|---|---|
| 위치 | `src/lib/auth/favorite-actions.ts:19` (`addFavorite`) |
| 현재 | `onConflict: 'user_id,complex_id'` |
| 실제 제약 | 부분 UNIQUE 인덱스 **2개** (아래) |
| 영향 | **즐겨찾기 추가 불가.** `FavoriteButton.tsx:30`에서 실사용 중 |
| 깨진 시점 | **2026-07-15** (`20260715000001_realtrade_story_site_scoping.sql:16`) → 16일간 회귀 |

현재 제약(`20260723081433_fix_favorites_area_type_unique.sql`):
```sql
favorites_complex_favorite_unique_idx  (user_id, complex_id, site_id)                WHERE area_type_id IS NULL
favorites_area_type_alert_unique_idx   (user_id, complex_id, area_type_id, site_id)  WHERE area_type_id IS NOT NULL
```

🔴 **부분 인덱스는 ON CONFLICT 추론이 원리적으로 불가능하다.** Postgres는 부분 인덱스를 추론하려면
INSERT 문에 인덱스 술어와 일치하는 `WHERE` 절이 필요한데, **PostgREST는 그 술어를 보낼 방법이 없다.**
→ `onConflict: 'user_id,complex_id,site_id'`로 바꿔도 **여전히 실패한다** (실측 확인).

**✅ 채택안 — 두 부분 인덱스를 `NULLS NOT DISTINCT` 단일 제약으로 통합**

```sql
create unique index favorites_user_complex_area_site_key
  on public.favorites (user_id, complex_id, area_type_id, site_id) nulls not distinct;
```

`20260723081433`의 주석은 4컬럼 UNIQUE를 검토했다가 *"area_type_id가 nullable이라 NULL은 서로
다른 값으로 취급돼 즐겨찾기 행이 여러 개 생길 수 있음"* 이라는 이유로 기각했다.
**그 판단은 기본 NULL 시맨틱 하에서는 옳다. 그러나 `NULLS NOT DISTINCT`(PostgreSQL 15+)가
정확히 그 문제를 해결한다.** 프로덕션은 **PostgreSQL 17.6** — 사용 가능.

**✅ 프로덕션 실측 검증 완료** (인덱스 생성 → 검증 → 즉시 DROP, 스키마 원상복구 확인):

| 검증 | 결과 |
|---|---|
| 기존 데이터가 새 제약과 충돌하는가 (4키, NULL 동일취급) | **0건** — 안전 |
| `UNIQUE ... NULLS NOT DISTINCT` 생성 | OK |
| `addFavorite` 경로 `on conflict (user_id,complex_id,area_type_id,site_id)` 추론 | **OK** |
| 임시 인덱스 DROP 후 `pg_indexes` 원상복구 | 확인됨 |

**의미 보존 확인**:
- `area_type_id IS NULL`(단지 즐겨찾기) → `(u, c, NULL, s)` 중복이 `NULLS NOT DISTINCT`로 차단됨
  = 기존 `favorites_complex_favorite_unique_idx`와 **동일 효과**
- `area_type_id IS NOT NULL`(평형 가격알림) → `(u, c, a, s)` 유일성
  = 기존 `favorites_area_type_alert_unique_idx`와 **동일 효과**
- `site_id` 포함 → 사이트별 분리 **유지**

앱 수정: `onConflict: 'user_id,complex_id,area_type_id,site_id'`.

> `area_type_id`·`site_id`가 INSERT 페이로드에 없어도 무방하다 — ON CONFLICT 추론은 인덱스
> 정의만 보고, 누락 컬럼은 DEFAULT(`site_id`는 `'danjiondo'`, `area_type_id`는 NULL)로 채워진다.
> 위 실측 3번이 정확히 이 경로(`insert (user_id, complex_id)`)를 테스트한 것이다.

**롤백 가능성**: 새 인덱스 생성 → 앱 배포 → 구 인덱스 2개 DROP 순서로 하면 무중단이다.
계획에서 이 순서를 명시할 것. `favorites`는 4행뿐이라 락 부담은 없다.

### F-02b: `removeFavorite`·`toggleFavoriteAlert`의 `site_id` 누락 (같은 파일, 함께 처리)

조사 중 발견한 **인접 결함**이다. 같은 파일·같은 뿌리(site 스코핑 마이그레이션이 앱 코드를
갱신하지 않음)이므로 함께 고친다.

```ts
// favorite-actions.ts:36-40 removeFavorite
.delete().eq('user_id', user.id).eq('complex_id', complexId)     // site_id·area_type_id 필터 없음
// favorite-actions.ts:57-61 toggleFavoriteAlert
.update({ alert_enabled: enabled }).eq('user_id', ...).eq('complex_id', ...)  // 동일
```

`favorites`의 RLS는 `favorites: owner all` (`auth.uid() = user_id`) **단 하나**로 site 스코핑을
하지 않는다(실측 확인). 따라서:
- `removeFavorite`가 **realtrade-story의 즐겨찾기까지 함께 삭제**한다
- 단지 즐겨찾기를 지우면 **그 단지의 평형 가격알림 행까지 전부 삭제**된다

→ `.eq('site_id', 'danjiondo')` 추가. `removeFavorite`는 `.is('area_type_id', null)` 도 필요한지
검토할 것(단지 즐겨찾기 해제가 알림까지 지우는 게 의도인지 판단 필요 — **판단 근거를 SUMMARY에
남길 것**).

### F-03: `new_listings` — 스키마 유지, 앱에서 명시적 조회 후 분기

| 항목 | 값 |
|---|---|
| 위치 | `src/app/api/cron/daily/route.ts:121-133` |
| 현재 | `onConflict: 'name,region'` |
| 실제 제약 | 부분 인덱스 `new_listings_molit_name_region_idx (name, region) WHERE pblanc_no IS NULL` |
| 영향 | MOLIT 분양권전매 적재 실패. 게다가 **error를 확인조차 안 한다**(`.select('id').single()`의 data만 사용) |

**결정: 인덱스를 비부분(non-partial)으로 바꾸지 않는다.**

근거 — 실측 데이터:

| 구분 | 행 수 |
|---|---|
| MOLIT 분양권 (`pblanc_no IS NULL`) | 3 |
| 청약 공고 (`pblanc_no IS NOT NULL`) | 94 |
| 두 그룹 간 `(name, region)` 충돌 | **0건** (현재) |

현재 충돌이 0건이라 해도 **비부분으로 바꾸면 앞으로 청약 공고와 MOLIT 행이 같은 단지명·지역에서
충돌**한다. 이 테이블은 두 데이터 소스가 공유하므로 제약을 느슨하게 만드는 건 위험하다.
부분 인덱스는 **의도된 설계**다.

**채택안 — 앱에서 명시적 조회 후 insert/update 분기**:
이 코드는 어차피 `.select('id').single()`로 **id를 되받아야** 하므로 upsert일 필요가 없다.

```
1) select id from new_listings where name=? and region=? and pblanc_no is null
2) 있으면 update ... returning id / 없으면 insert ... returning id
3) error를 반드시 확인해 errors[]에 push
```

> 동시성: 이 경로는 일배치 크론 단독 실행이라 경합이 없다. 그래도 insert가 23505로 실패하면
> 재조회하는 방어를 넣을지는 실행자 재량(Claude's Discretion).

**F-03에는 에러 확인 추가가 포함된다** — 이게 없었기 때문에 이 고장이 지금까지 안 보였다.

### F-04: `redevelopment_projects` — UNIQUE 제약 신설

| 항목 | 값 |
|---|---|
| 위치 | `src/lib/actions/redevelopment-actions.ts:77` |
| 현재 | `onConflict: 'complex_id'` (주석: "complex_id 기준 — 단지당 1개 row") |
| 실제 제약 | PK `(id)` **뿐** |
| 영향 | 어드민 재건축 정보 저장 실패 |

**여기서는 코드가 아니라 스키마가 의도에서 벗어나 있다.** 주석과 코드가 명시적으로 "단지당 1개"를
의도하는데 제약이 그걸 강제하지 않는다.

**✅ 실측 검증 완료**: 중복 `complex_id` 그룹 **0건** → 제약 추가 안전.

```sql
alter table public.redevelopment_projects
  add constraint redevelopment_projects_complex_id_key unique (complex_id);
```

앱 코드(`onConflict: 'complex_id'`)는 **그대로 둔다** — 제약이 생기면 의도대로 동작한다.

> 다른 3건과 방향이 반대(코드→제약이 아니라 제약→코드)인 이유: 나머지는 제약이 의도된 설계였고
> 코드가 낡았지만, 여기는 제약 자체가 처음부터 없었다.

### F-05: 재발 방지 게이트 — onConflict↔제약 일치 자동 검증 🔑

**이 Phase의 핵심 산출물이다.** 고장 4건 전부 같은 방식으로 발생했고, 게이트가 없으면
다음 마이그레이션에서 또 발생한다.

요구사항:
- `src/` 전체에서 `.upsert(..., { onConflict: '...' })` 호출을 **수집**하고, 각 (테이블, 컬럼목록)이
  DB의 **추론 가능한**(=비부분) UNIQUE 인덱스와 일치하는지 검증
- 🔴 **부분 인덱스를 "일치"로 판정하면 안 된다** — F-02·F-03이 정확히 그 함정이었다.
  `pg_index.indpred IS NOT NULL`이면 추론 불가로 처리할 것
- 컬럼 **순서**는 무관하다 (Postgres 추론은 집합 기준) — 정렬 후 비교할 것

구현 방식은 실행자 재량이나, 아래를 고려할 것:
- 테이블/컬럼 수집: 정적 파싱(정규식 또는 AST) vs 알려진 목록 하드코딩
  → **정적 수집을 권장**한다. 하드코딩하면 신규 upsert가 게이트를 그냥 빠져나간다
- DB 연결이 필요하므로 **라이브 DB 없으면 skip**되도록 할 것 — 이 저장소엔 이미
  DB 의존 테스트가 다수 있고 그중 35건이 사전 실패 상태다. **새 테스트가 그 목록을 늘리면 안 된다**
- 판정에 `EXPLAIN INSERT ... ON CONFLICT` 실행을 쓰는 것도 유효한 방법이다(오케스트레이터가
  이번 조사에서 쓴 방법 — 부분 인덱스 함정을 자동으로 회피한다). 단 NOT NULL·enum·FK 때문에
  더미 값 생성이 까다로우니 트레이드오프를 판단할 것

### F-06: Claude's Discretion

- 마이그레이션 파일 분할/병합, 파일명·타임스탬프
- F-05의 구현 방식(정적 파싱 vs EXPLAIN 실행), 테스트 파일 위치
- F-03의 23505 재조회 방어 포함 여부
- `removeFavorite`의 `area_type_id` 필터 포함 여부 (근거를 SUMMARY에 남길 것)

</decisions>

<baseline>
## 실행 전 기준값 (오케스트레이터 프로덕션 실측, 2026-07-31)

### onConflict 판정 전수 결과

`EXPLAIN INSERT ... ON CONFLICT`로 판정. **🔴 = 수정 대상**

| 위치 | 테이블 (onConflict) | 판정 |
|---|---|---|
| `daily/route.ts:355` | `facility_kapt (complex_id)` | 🔴 BROKEN |
| `favorite-actions.ts:19` | `favorites (user_id,complex_id)` | 🔴 BROKEN |
| `daily/route.ts:130` | `new_listings (name,region)` | 🔴 BROKEN |
| `redevelopment-actions.ts:77` | `redevelopment_projects (complex_id)` | 🔴 BROKEN |
| `gap-stats.ts:100` | `complex_gap_stats (complex_id)` | ✅ OK |
| `daily/route.ts:150` | `presale_transactions (listing_id,deal_date,area,floor)` | ✅ OK |
| `daily/route.ts:188,227` | `new_listings (pblanc_no)` | ✅ OK |
| `realprice.ts:64` | `transactions (dedupe_key)` | ✅ OK |
| `rankings.ts:249` | `complex_rankings (rank_type,complex_id,window_days)` | ✅ OK |
| `cafe-posts.ts:75` | `cafe_posts (url)` | ✅ OK |
| `cafe-articles.ts:54` | `cafe_articles (naver_article_id)` | ✅ OK |
| `push-actions.ts:21` | `push_subscriptions (endpoint)` | ✅ OK |
| `topic-actions.ts:21` | `notification_topics (user_id,topic)` | ✅ OK |
| `realtor-actions.ts:169` | `realtor_assignments (complex_id,display_order)` | ✅ OK |
| `complex-matching.ts:281` | `complex_aliases (complex_id,source,alias_name)` | ✅ OK |
| `listing-price-actions.ts:75` | `listing_prices (complex_id,recorded_date,source)` | ✅ OK |
| `kakao-channel-actions.ts:40` | `kakao_channel_subscriptions (user_id)` | ✅ OK |

### 데이터 기준값

| 항목 | 값 |
|---|---|
| PostgreSQL | **17.6** (`NULLS NOT DISTINCT` 사용 가능) |
| `facility_kapt` | 3,661행 (전부 수동 적재) |
| `complexes` where `kapt_code is not null` | 2,922 |
| `favorites` | 4행 (`area_type_id` null 1 / not null 3) |
| `favorites` 4키 중복 (NULL 동일취급) | **0건** |
| `new_listings` | 97행 (MOLIT 3 / 청약 94), 그룹 간 `(name,region)` 충돌 **0건** |
| `redevelopment_projects` 중복 `complex_id` | **0건** |
| `data_sources.kapt` | `last_status = null` (성공 기록 없음) |
| `data_sources.gap-stats` | `failed`, `consecutive_failures=2`, `error_message` **비어 있음** |
| `migration list --linked` | 0/0 |
| 테스트 베이스라인 | **35 failed / 497 passed / 66 skipped** |

### gap-stats 성능 — 범위 밖인 이유 (기록용)

`compute_gap_stats(12)`가 6,191ms로 회귀했다는 이전 보고는 **오측이었다.**
이 인스턴스는 `clock_gettime`이 비싸서 `EXPLAIN ANALYZE`의 per-row 타이밍 계측이 실행시간을
지배한다:

| 측정 | 결과 |
|---|---|
| `EXPLAIN (ANALYZE)` | 6,637ms |
| `EXPLAIN (ANALYZE, TIMING OFF)` | 288ms |
| 실제 wall-clock | **185ms** |

PostgREST `statement_timeout`은 8초 — 여유가 충분하다. 인덱스 변경 불필요.

2026-07-30 19:52의 `canceling statement due to statement timeout` 2건은 다른 세션이
`transactions_valid_complex_price_idx`를 갓 만들어 통계·visibility map이 미갱신이던 **일시적**
현상이며, 21:10 autoanalyze 이후 해소됐다.

🔴 **교훈(계획에 반영할 것)**: 이 프로젝트에서 성능을 판정할 때 `EXPLAIN ANALYZE`의
`Execution Time`을 그대로 믿지 마라. `TIMING OFF` 또는 wall-clock으로 교차 확인할 것.

</baseline>

<scope_fence>
## Scope Fence

1. **✅ OK로 판정된 13개 upsert 지점을 건드리지 마라.** 전부 실측 확인됨
2. **`favorites`의 site_id 스코핑 의미를 깨지 마라** — 즐겨찾기는 사이트별로 독립이어야 한다
3. **`favorites`의 "단지 즐겨찾기 vs 평형 가격알림" 구분을 깨지 마라** — `area_type_id` NULL 여부로
   나뉘는 의도된 설계다. 부분 술어를 그냥 지우면 두 종류가 충돌한다
4. **`new_listings`의 부분 인덱스를 비부분으로 바꾸지 마라** (F-03). 청약 공고와 충돌 위험
5. **`facility_kapt`의 `(complex_id, data_month)` 제약을 바꾸지 마라** — 월별 이력이 의도다
6. **마이그레이션은 `npm run db:push`로 적용한다.** `execute_sql`·MCP `apply_migration`·대시보드
   금지 — 그게 Phase 37이 청소한 원장 drift의 원인이다
7. `CREATE INDEX CONCURRENTLY`를 쓰면 `db push` 불가 → 별도 적용 후
   `npx supabase migration repair --status applied <version>` 필수 (CLAUDE.md 규약).
   ⚠️ 단 이 Phase의 대상 테이블은 `favorites` 4행 / `redevelopment_projects` 소량이라
   **`CONCURRENTLY`가 필요 없다.** 일반 `CREATE INDEX`로 `db push` 정상 경로를 쓰는 걸 권장
8. **신규 테스트가 사전 실패 35건을 늘리면 안 된다.** DB 없으면 skip 처리
9. **회귀 판정은 총계 비교로 하지 마라.** `git stash`로 베이스라인을 실측해 비교할 것
   (`.planning/fix-loop/error-notes.md` #001 — 이 세션에서 두 번 필요했던 방법)
10. gap-stats 성능·인덱스 무접촉. 창부레터 0-4~0-7 무접촉

</scope_fence>

## Success Criteria

1. **4건 모두** 프로덕션에서 `EXPLAIN INSERT ... ON CONFLICT`가 에러 없이 통과
2. `addFavorite()` 실동작 — 추가 성공 / 중복 추가 시 에러 없음 / 사이트 간 분리 유지 /
   평형 가격알림 행과 충돌 없음
3. `favorites` 구 부분 인덱스 2개가 제거되고 통합 제약 1개만 남음 (또는 유지 결정 시 근거 명시)
4. `removeFavorite`·`toggleFavoriteAlert`에 `site_id` 필터 존재
5. 일배치 실행 후 `data_sources.kapt.last_status = 'success'`,
   `facility_kapt`에 당월 `data_month` 행이 증가
6. `new_listings` MOLIT 경로가 error를 확인해 `errors[]`에 반영
7. **F-05 게이트 테스트가 존재하고 통과** — 부분 인덱스를 일치로 오판하지 않음을 보이는
   케이스 포함 (예: 수정 전 `favorites` 형태를 넣으면 실패로 판정)
8. `npm run lint`(ESLint+tsc) 통과
9. 테스트 회귀 **0건** — `git stash` 베이스라인 실측 대비
10. `npx supabase migration list --linked` 0/0 유지

## Risk Summary

| 위험 | 완화 |
|------|------|
| `favorites` 제약 교체가 기존 4행과 충돌 | ✅ **해소** — 4키 중복 0건 실측. 인덱스 생성→추론→DROP 왕복까지 프로덕션에서 성공 확인 |
| 제약 교체 중 즐겨찾기 기능 순간 중단 | 신규 인덱스 생성 → 앱 배포 → 구 인덱스 DROP 순서. 4행이라 락 무시 가능 |
| `NULLS NOT DISTINCT`가 의미를 미묘하게 바꿈 | 두 부분 인덱스와 등가임을 위 표로 대조. 실행 후 실동작 검증(Success Criteria 2)으로 재확인 |
| `new_listings` 재작성이 청약 경로를 깨뜨림 | 청약 경로는 `onConflict: 'pblanc_no'`로 **정상 판정**됐다. MOLIT 경로만 수정 |
| F-05 게이트가 오탐으로 CI를 막음 | 부분 인덱스 판정 규칙을 명시적으로 구현하고, 현재 ✅ 13건이 전부 통과함을 확인 |
| 마이그레이션이 원장 drift 유발 | `db push` 정상 경로 사용. 적용 후 `migration list --linked` 0/0 확인 |
| K-apt 수정 효과를 당일 확인 불가 | 일배치는 04:00 KST 1회. 수동 트리거 또는 다음 실행 후 확인으로 계획할 것 |
