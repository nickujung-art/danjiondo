# Phase 37: 마이그레이션 원장·저장소 정합성 회복 - Context

**Gathered:** 2026-07-30
**Status:** Ready for planning
**Source:** Phase 36 실행 중 발견 + 오케스트레이터 라이브 DB 조사

> ⚠️ **이 Phase는 스키마를 변경하지 않는다.** 모든 작업은 (a) 마이그레이션 파일 생성·리네이밍
> (b) 원장(`supabase_migrations.schema_migrations`) 조작뿐이다. `execute_sql`로 DDL을 실행하는
> 일이 있으면 잘못된 것이다 — 검증용 읽기 조회만 허용.

<domain>
## Phase Boundary

Phase 36 실행 중 `npm run db:push`가 마이그레이션 원장 drift로 거부되는 것이 발견됐다
(`.planning/phases/36-db-supabase/36-00-SUMMARY.md`). Phase 36은 `execute_sql` +
`migration repair`로 우회해 완료했지만, drift 자체는 이월됐다.

**원인**: 6/18 이후 마이그레이션이 파일명이 아니라 **적용 시각을 버전으로 기록하는 경로**
(MCP `apply_migration` 또는 대시보드 SQL 에디터)로 적용돼 왔다. 그 결과:

- 로컬 파일과 remote 기록의 버전이 짝이 안 맞는다 (로컬 `20260619000000` ↔ remote `20260619062830`)
- **로컬 파일이 아예 없는 프로덕션 스키마 객체 5건**이 생겼다 → `db reset` 시 재현 불가

**이 Phase가 하는 일**:
1. 프로덕션 전용 5건을 원장 `statements`에서 추출해 로컬 파일로 복원
2. remote 전용 13건(중복 12 + 덮인 구버전 1)을 원장에서 `reverted` 처리
3. 로컬 타임스탬프 중복 3쌍 리네이밍
4. `migration list` 완전 매칭 + `db push --dry-run` 통과 확인

**이 Phase가 하지 않는 일**:
- 스키마 변경 일체
- 발견된 하드닝 후보 수정 (`TO` 절 누락, `using (true)`) — **충실 재현이 목적이라 고치면 안 된다.**
  별도 Phase로 이월
- `recommend_hagwons` 오버로드 2개 정리 (아래 참고 — 앱 코드 확인이 선행돼야 함)
- 애플리케이션 코드 변경
- 창부레터 0-4~0-7

</domain>

<decisions>
## Implementation Decisions

### D-01: 복원 파일명은 remote 버전을 그대로 쓴다

원장에 이미 그 버전이 `applied`로 기록돼 있으므로, 파일명을 remote 버전과 같게 하면
**`repair`가 필요 없고** `migration list`에서 local==remote로 매칭된다. 신규 버전을 붙이면
원장에 없는 버전이 되어 push 대상이 되고, 이미 적용된 DDL을 재실행해 에러가 난다.

| 생성할 파일 | 원장 version | 크기 |
|---|---|---|
| `supabase/migrations/20260618085750_perf_review_avg_rpc.sql` | `20260618085750` | 328B |
| `supabase/migrations/20260618085906_rls_regional_income_area_types_ad_events.sql` | `20260618085906` | 663B |
| `supabase/migrations/20260618093403_fix_security_definer_search_path_v2.sql` | `20260618093403` | 433B |
| `supabase/migrations/20260625063824_cardnews_payloads_storage_policies.sql` | `20260625063824` | 574B |
| `supabase/migrations/20260728074553_realtrade_story_ads_admin.sql` | `20260728074553` | 3.0KB |

파일명의 이름 부분은 원장의 `name` 컬럼 값을 그대로 쓴다.

### D-02: 복원할 SQL 전문 — 이것을 그대로 쓴다

오케스트레이터가 원장 `statements[1]`에서 추출한 원본이다. **수정하지 말 것.**
각 파일 상단에 "Phase 37 복원 — 원장 version X에서 추출, 프로덕션 그대로 재현" 주석만 추가한다.

#### `20260618085750_perf_review_avg_rpc.sql`
```sql
-- 리뷰 평균 집계 RPC (앱 레이어 풀스캔 대신 DB 집계)
CREATE OR REPLACE FUNCTION public.get_complex_review_avg(p_complex_id UUID)
RETURNS FLOAT LANGUAGE sql STABLE AS $$
  SELECT AVG(rating)::FLOAT FROM public.complex_reviews WHERE complex_id = p_complex_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_complex_review_avg TO anon, authenticated;
```

#### `20260618085906_rls_regional_income_area_types_ad_events.sql`
```sql
-- C-2: regional_income RLS 활성화
ALTER TABLE public.regional_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regional_income: public read"
  ON public.regional_income FOR SELECT USING (true);

-- C-3: complex_area_types RLS 활성화
ALTER TABLE public.complex_area_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "complex_area_types: public read"
  ON public.complex_area_types FOR SELECT USING (true);

-- H-3: ad_events INSERT 정책 — 인증된 사용자만 허용하도록 강화
DROP POLICY IF EXISTS "ad_events: authenticated insert" ON public.ad_events;
CREATE POLICY "ad_events: authenticated insert"
  ON public.ad_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
```

> 🔴 **이 파일이 `ad_events` 버그의 수정본이다.** 로컬 `20260430000009_rls.sql:151-153`은
> `TO` 절 없는 버그 버전이고, 프로덕션은 이 마이그레이션으로 이미 수정된 상태다
> (실측: `roles={authenticated}`, `with_check (auth.uid() IS NOT NULL)`).
> **`20260430000009_rls.sql`을 고치지 마라** — 이 복원 파일이 뒤에서 덮으므로
> `db reset` 시 최종 상태가 올바르다. 원본 파일을 고치면 프로덕션 이력과 달라진다.

#### `20260618093403_fix_security_definer_search_path_v2.sql`
```sql
-- SECURITY DEFINER 함수 schema injection 방지 (search_path = '' 고정)
ALTER FUNCTION public.check_gps_proximity(uuid, double precision, double precision, integer) SET search_path = '';
ALTER FUNCTION public.get_hagwon_grade(uuid) SET search_path = '';
ALTER FUNCTION public.get_recent_complex_sales(uuid[], date) SET search_path = '';
ALTER FUNCTION public.get_schools_for_point(double precision, double precision) SET search_path = '';
```

#### `20260625063824_cardnews_payloads_storage_policies.sql`
```sql
-- cardnews-payloads 버킷 RLS 정책
-- 공개 읽기: GitHub Actions가 payload URL로 다운로드 가능
CREATE POLICY "cardnews-payloads public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'cardnews-payloads');

-- 서비스 롤만 업로드/삭제 가능 (어드민 API Route → SUPABASE_SERVICE_ROLE_KEY 사용)
CREATE POLICY "cardnews-payloads service insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'cardnews-payloads' AND auth.role() = 'service_role');

CREATE POLICY "cardnews-payloads service delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'cardnews-payloads' AND auth.role() = 'service_role');
```

#### `20260728074553_realtrade_story_ads_admin.sql`
```sql
-- Phase 4 (realtrade-story): site_admin_roles table + RLS policies for ad_campaigns,
-- presale_discoveries, new_listings, and the new realtrade-story-ad-images Storage bucket.
-- Applies to shared Supabase project auoravdadyzvuoxunogh (danjiondo + realtrade-story).

create table public.site_admin_roles (
  user_id     uuid not null references auth.users(id) on delete cascade,
  site_id     text not null check (site_id in ('danjiondo', 'realtrade-story')),
  role        text not null default 'staff',
  created_at  timestamptz not null default now(),
  primary key (user_id, site_id)
);

alter table public.site_admin_roles enable row level security;

-- Owner-only self-check — deliberately NO insert/update/delete policy for `authenticated`;
-- role grants happen only via service_role/SQL editor, never from the client.
create policy "site_admin_roles: owner read"
  on public.site_admin_roles for select
  using (auth.uid() = user_id);

-- ── ad_campaigns: realtrade-story site-admin write/read-all ──
create policy "ad_campaigns: realtrade-story admin insert"
  on public.ad_campaigns for insert
  with check (
    site_id = 'realtrade-story'
    and exists (select 1 from public.site_admin_roles
                where user_id = auth.uid() and site_id = 'realtrade-story')
  );

create policy "ad_campaigns: realtrade-story admin update"
  on public.ad_campaigns for update
  using (
    site_id = 'realtrade-story'
    and exists (select 1 from public.site_admin_roles
                where user_id = auth.uid() and site_id = 'realtrade-story')
  );

create policy "ad_campaigns: realtrade-story admin read all"
  on public.ad_campaigns for select
  using (
    site_id = 'realtrade-story'
    and exists (select 1 from public.site_admin_roles
                where user_id = auth.uid() and site_id = 'realtrade-story')
  );

-- ── presale_discoveries: extend admin gate to site_admin_roles ──
create policy "presale_discoveries: realtrade-story site admin all"
  on public.presale_discoveries for all
  using (
    exists (select 1 from public.site_admin_roles
            where user_id = auth.uid() and site_id = 'realtrade-story')
  );

-- ── new_listings: realtrade-story admin insert (D-14 — full-parity confirm write) ──
create policy "new_listings: realtrade-story admin insert"
  on public.new_listings for insert
  with check (
    exists (select 1 from public.site_admin_roles
            where user_id = auth.uid() and site_id = 'realtrade-story')
  );

-- ── NEW Storage bucket for ad creatives, following the gps-docs precedent exactly ──
insert into storage.buckets (id, name, public)
values ('realtrade-story-ad-images', 'realtrade-story-ad-images', true)
on conflict (id) do nothing;

create policy "realtrade-story-ad-images: site admin upload"
  on storage.objects for insert
  with check (
    bucket_id = 'realtrade-story-ad-images'
    and exists (select 1 from public.site_admin_roles
                where user_id = auth.uid() and site_id = 'realtrade-story')
  );
```

> ⚠️ 이 파일의 정책들도 **`TO` 절이 없다**(기본값 `TO public`). `auth.uid()` 조건이 `anon`을
> 실질적으로 막으므로 악용 가능하지는 않다. **고치지 마라** — D-03 참고.

### D-03: 복원은 충실 재현 — 개선 금지

복원 파일에서 아래를 "고치고 싶은" 유혹이 생긴다. **전부 그대로 둔다.**

| 발견 | 왜 그대로 두는가 |
|---|---|
| `regional_income`·`complex_area_types` 정책이 `USING (true)` + `TO` 절 없음 | 프로덕션 현재 상태다. 고치면 로컬≠프로덕션이 되어 이 Phase의 목적이 무너진다 |
| `site_admin_roles`·`ad_campaigns`·`new_listings`·`presale_discoveries` 정책에 `TO` 절 없음 | 동일. `auth.uid()` 조건이 실질 차단을 하고 있어 위험도 낮음 |
| `cardnews-payloads` 정책에 `TO` 절 없음 | 동일 |

**이유**: 이 Phase의 성공 기준은 "`db reset`이 프로덕션을 재현한다"이다. 복원 중 개선하면
재현이 깨지고, 게다가 프로덕션과 로컬이 다르다는 원래 문제가 형태만 바뀌어 남는다.
하드닝은 **별도 Phase**에서, 프로덕션과 로컬을 함께 바꾸는 방식으로 한다.

### D-04: `reverted` 처리 대상 13건 — DRIFT-01 완료 후에만

remote 전용 18건 중 5건은 D-01로 복원되고, 나머지 13건은 원장에서 제거한다.

**중복 12건** (로컬 파일이 같은 내용을 자기 버전으로 이미 applied):

| remote version | name | 대응 로컬 파일 |
|---|---|---|
| `20260618051341` | phase28_hagwon_system | `20260619000001_phase28_hagwon_system.sql` |
| `20260618073750` | phase28_subject_v2 | `20260619000002_phase28_subject_v2.sql` |
| `20260619043107` | add_hagwon_blog_fields | `20260619000003_recommend_hagwon_candidates_v2.sql` (`blog_snippet` 포함) |
| `20260619062830` | assign_area_types | `20260619000000_assign_area_types.sql` |
| `20260619072547` | recommend_hagwon_candidates_rpc | `20260619000002_recommend_hagwon_candidates_rpc.sql` |
| `20260619075829` | recommend_hagwon_candidates_v2 | `20260619000003_recommend_hagwon_candidates_v2.sql` |
| `20260624045555` | backfill_area_types | `20260624000001_backfill_area_types.sql` |
| `20260624045621` | area_type_trigger | `20260624000002_area_type_trigger.sql` |
| `20260624045635` | rpc_add_exclusive_area | `20260624000003_rpc_add_exclusive_area.sql` |
| `20260707051809` | area_type_ambiguity_guard | `20260707000000_area_type_ambiguity_guard.sql` |
| `20260709061130` | find_nearby_similar_complexes | `20260708000001_find_nearby_similar_complexes.sql` |
| `20260715030221` | realtrade_story_site_scoping | `20260715000001_realtrade_story_site_scoping.sql` |

**덮인 구버전 1건**:

| `20260618075929` | phase28_route_rpc | `20260619000003_..._v2.sql`이 DROP·재생성해 덮었다. 라이브 `recommend_hagwon_candidates` 인자가 7개(`p_school_lat/lng` 포함)로 v2 시그니처와 일치함을 실측 확인 |

🔴 **순서 필수**: DRIFT-01(복원 5건)을 먼저 커밋한 뒤에 이 13건을 reverted 처리한다.
순서를 어기면 복원 대상 5건의 유일한 기록이 원장에서 사라져 추출이 불가능해진다.

### D-05: 타임스탬프 중복 3쌍 — 의존 순서 보존이 핵심

같은 버전 접두어를 가진 로컬 파일이 2개씩 있다. CLI는 버전 단위로 원장을 관리하므로
한쪽만 기록되면 다른 쪽이 영구 추적 불가가 된다.

| 중복 버전 | 파일 A | 파일 B |
|---|---|---|
| `20260618000001` | `_complex_area_types.sql` | `_fix_avg_sale_per_pyeong_formula.sql` |
| `20260618000002` | `_area_type_chart_rpc.sql` | `_fix_prediction_model_priority.sql` |
| `20260619000002` | `_phase28_subject_v2.sql` | `_recommend_hagwon_candidates_rpc.sql` |

**각 쌍에서 어느 파일을 옮길지는 두 파일 내용을 읽고 의존 순서로 판단한다.**

오케스트레이터가 이미 확인한 제약:

- **`20260619000002` 쌍**: `_recommend_hagwon_candidates_rpc.sql`은 **옮길 수 없다.**
  `20260619000003_recommend_hagwon_candidates_v2.sql`이 이 함수를 `DROP` 후 재생성하므로,
  rpc 파일이 v2보다 뒤로 가면 **구버전이 v2를 덮어써 최종 상태가 틀린다.**
  → 짝인 `_phase28_subject_v2.sql`을 옮긴다. 이 파일은 `hagwon_db`(`20260619000001`)만
  선행 조건이고 RPC 생성과는 순서 무관이므로 뒤로 옮겨도 안전
- **나머지 2쌍**: 두 파일이 서로 독립인지 반드시 확인할 것. 독립이면 어느 쪽을 옮겨도 되지만,
  **선행 조건이 있는 쪽을 앞에 남긴다**

**빈 슬롯**: 로컬 6/18은 `000001`·`000002`만, 6/19는 `000000`~`000003`만 존재한다
(`migration list` 실측). 착수 시 `ls supabase/migrations/`로 재확인할 것.

리네이밍한 파일의 새 버전은 원장에 없으므로 **`repair --status applied`로 기록**해야 한다
(그러지 않으면 push 대상이 된다).

### D-06: 검증은 CLI 출력으로 판정

```bash
npx supabase migration list --linked   # local-only 0건, remote-only 0건
npx supabase db push --dry-run          # 에러 없이 통과, 적용 대상 없음
```

그리고 스키마 무변경 확인 (실행 전후 동일해야 함 — 아래 `<baseline>` 참고).

### D-07: Claude's Discretion

- 복원 파일 상단 주석 문구
- 리네이밍 새 타임스탬프 값 (충돌 없고 의존 순서를 보존하면 됨)
- 검증 조회를 MCP `execute_sql` / `supabase db query` 중 무엇으로 할지

</decisions>

<baseline>
## 실행 전 기준값 (오케스트레이터 실측, 2026-07-30)

스키마 무변경 확인용. Phase 37 종료 시 **전부 동일**해야 한다.

| 객체 | 상태 |
|---|---|
| `site_admin_roles` 테이블 | 존재, 1행, 정책 1개 |
| `get_complex_review_avg` 함수 | 존재 |
| `regional_income` RLS | `relrowsecurity=true`, 정책 1개 |
| `cardnews-payloads` 스토리지 정책 | 3개 (`storage.objects`) |
| `check_gps_proximity` | `proconfig = search_path=""` |
| `recommend_hagwon_candidates` | 1개 (인자 7개: `p_home_lat/lng`, `p_school_lat/lng`, `p_age_group`, `p_subject`, `p_limit`) |
| `ad_events` 정책 | `roles={authenticated}`, `with_check (auth.uid() IS NOT NULL)` |
| `complexes` | 4,285행 |
| `hagwon_db` | 4,601행 |
| `complex_area_types` | 3,472행 |
| 신규 창부레터 테이블 5개 | RLS on, 정책 7개, 전부 0행 |

**remote 전용 18건 / local 전용 3건** — 오케스트레이터가 `migration list --linked`로 실측 확인
(2026-07-30, Phase 36 완료 후).

local 전용 3건은 **전부 중복 타임스탬프 쌍의 두 번째 파일**이다. 정체 미확인 항목은 없다:

| local 전용 | 정체 |
|---|---|
| `20260618000001` | 중복 쌍 — `_complex_area_types.sql` / `_fix_avg_sale_per_pyeong_formula.sql` |
| `20260618000002` | 중복 쌍 — `_area_type_chart_rpc.sql` / `_fix_prediction_model_priority.sql` |
| `20260619000002` | 중복 쌍 — `_phase28_subject_v2.sql` / `_recommend_hagwon_candidates_rpc.sql` |

Phase 36의 `20260730000001`·`2`·`3`은 전부 local==remote 매칭 상태다(신규 drift 없음 재확인).

→ **DRIFT-04(리네이밍 3쌍)만 처리하면 local 전용이 0건이 된다.** 추가 조사 대상 없음.

Phase 37 종료 시 양쪽 0건.

</baseline>

<observations>
## 조사 중 발견 — 이 Phase 범위 밖, 별도 처리

### O-1: `recommend_hagwons` 오버로드 2개 공존

```
recommend_hagwons(p_lat, p_lng, p_age_group, p_subjects text[], p_fee_tier  text,   p_limit)
recommend_hagwons(p_lat, p_lng, p_age_group, p_subjects text[], p_fee_tiers text[], p_limit)
```

`phase28_subject_v2`가 `fee_tier`를 배열화할 때 구버전을 `DROP`하지 않았다. 인자를 명시하지
않고 호출하면 **모호성 에러**가 날 수 있다.

**이 Phase에서 고치지 않는 이유**: 함수를 드롭하는 건 스키마 변경이고, 앱 코드
(`src/lib/**/hagwon*`)가 어느 시그니처를 호출하는지 확인이 선행돼야 한다.
→ 별도 Phase.

### O-2: `TO` 절 누락 정책 다수 — 하드닝 후보

`regional_income`, `complex_area_types`, `site_admin_roles`, `ad_campaigns`(realtrade-story
정책 3개), `presale_discoveries`, `new_listings`, `cardnews-payloads`(3개) 정책에 `TO` 절이
없다(기본값 `TO public`). 대부분 `auth.uid()` 조건이 `anon`을 실질 차단하고 있어 즉각적 위험은
낮으나, 의도가 코드에 드러나지 않는다.

**이 Phase에서 고치지 않는 이유**: D-03(충실 재현). 하드닝은 프로덕션과 로컬을 **함께**
바꾸는 별도 Phase에서.

</observations>

<scope_fence>
## Scope Fence

**절대 하지 말 것**

1. **스키마 변경 금지.** `execute_sql`로 DDL(`create`/`alter`/`drop`) 실행 금지. 읽기 조회만
2. **복원 SQL 수정 금지.** D-02의 5개 블록을 그대로 파일에 넣는다. `TO` 절 추가,
   `using (true)` 개선, 포맷 변경 전부 금지 (D-03)
3. **`20260430000009_rls.sql` 수정 금지.** `ad_events` 버그 버전을 그대로 둔다 — 복원 파일
   `20260618085906`이 뒤에서 덮으므로 최종 상태가 올바르다. 원본을 고치면 프로덕션 이력과 달라진다
4. **DRIFT-03을 DRIFT-01보다 먼저 하지 말 것.** 복원 5건 커밋 전에 reverted를 실행하면
   유일한 기록이 사라진다
5. **`20260619000002_recommend_hagwon_candidates_rpc.sql`을 뒤로 옮기지 말 것** (D-05)
6. **`recommend_hagwons` 오버로드 정리 금지** (O-1 — 별도 Phase)
7. **`TO` 절 하드닝 금지** (O-2 — 별도 Phase)
8. **애플리케이션 코드 무접촉.** `src/**` 변경 0
9. **`npm run db:push`를 실제 적용 목적으로 실행 금지.** `--dry-run`만 (검증용)
10. 창부레터 0-4~0-7 무접촉

</scope_fence>

## Success Criteria

1. 프로덕션 전용 5건이 remote 버전 파일명으로 `supabase/migrations/`에 존재하고, 내용이
   원장 `statements[1]`과 **바이트 단위로 일치**(주석 헤더 추가분 제외)
2. `npx supabase migration list --linked` — local-only **0건**, remote-only **0건**
3. `npx supabase db push --dry-run` — 에러 없이 통과, 적용 대상 없음
4. `ls supabase/migrations/`에 타임스탬프 중복 **0건**
5. `<baseline>`의 모든 항목이 실행 전후 동일 (스키마 무변경 증명)
6. `npm run lint` 통과, `git status --porcelain src/` 빈 출력
7. O-1·O-2가 SUMMARY에 별도 Phase 이월로 기록됨

## Risk Summary

| 위험 | 완화 |
|------|------|
| DRIFT-03을 먼저 실행해 복원 대상 기록 소실 | Wave 경계로 강제 (Wave 0 복원 → Wave 1 정리). Scope Fence 4번 |
| 복원 중 "개선"해서 로컬≠프로덕션 유지 | D-03 + Scope Fence 2번. Success Criteria 1번이 바이트 일치를 요구 |
| 리네이밍이 의존 순서를 깨서 `db reset` 최종 상태가 틀어짐 | D-05에 확인된 제약 명시. 각 쌍마다 두 파일 내용 확인 의무 |
| 리네이밍 새 버전을 원장에 기록하지 않아 push 대상이 됨 | D-05 마지막 문단. Success Criteria 3번이 `--dry-run` 통과를 요구 |
| `reverted` 처리가 실제로 미적용인 마이그레이션을 지움 | 12건 전부 대응 로컬 파일을 D-04 표에 명시했고, Phase 36에서 라이브 효과를 이미 실측 확인했다 |
| 스키마를 실수로 변경 | Scope Fence 1번 + `<baseline>` 전후 대조 |
