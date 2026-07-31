-- public.unique_indexes_for_table(text) — UNIQUE 인덱스 카탈로그 조회 함수. (Phase 39 F-05)
--
-- [무엇을 위한 함수인가]
-- Phase 39 의 고장 4 건(facility_kapt / favorites / new_listings / redevelopment_projects)은
-- 전부 같은 방식으로 생겼다 — 마이그레이션이 UNIQUE 제약을 바꿨는데 애플리케이션 코드의
-- `.upsert(…, { onConflict: '…' })` 는 그대로 남았다. 개별 수정만으로는 다음 마이그레이션에서
-- 반드시 재발한다. 그래서 `src/` 의 upsert 지점을 정적 수집해 **실제 카탈로그와 대조**하는
-- 회귀 게이트(src/__tests__/onconflict-constraint-gate.test.ts)를 세우고, 그 게이트가 읽는
-- 카탈로그 창구가 이 함수다.
--
-- [왜 필터링을 하지 않는가 — 설계 결정]
-- 이 함수는 `indpred is null` 같은 **필터를 걸지 않는다.** 모든 UNIQUE 인덱스를 플래그
-- (is_partial / is_expression / is_valid) 와 함께 그대로 돌려주고, 제외 판정은 TypeScript
-- (src/lib/db/onconflict-audit.ts 의 toInferrable) 가 한다.
-- 근거: F-05 의 **핵심 함정**은 "부분 인덱스를 일치로 판정하는 것" 이다. 그 규칙이 SQL 안에
-- 숨어 있으면 라이브 DB 없이는 검증할 수 없다. TS 로 올려야 음성 대조(수정 전 favorites 형태를
-- 넣으면 FAIL) 가 DB 없이 CI 에서도 항상 실행된다.
--
-- [권한 결정]
-- `security invoker` + `revoke from public, anon, authenticated` + `grant to service_role`.
-- `SECURITY DEFINER` 는 불필요하다 — pg_index·pg_class 는 기본적으로 모든 롤이 읽을 수 있으므로
-- 권한 승격을 만들 이유가 없다. `public` 스키마 함수는 기본적으로 PostgREST 에 노출되므로
-- grant 를 좁히지 않으면 anon 도 카탈로그를 읽는다 → 명시적으로 revoke 한다.
--
-- [반환 계약]
--   index_name    text     인덱스 이름
--   columns       text[]   키 컬럼 이름. **attname 알파벳 정렬** (ON CONFLICT 추론은 집합 기준이라
--                          순서가 무관하다). indnkeyatts 제한으로 INCLUDE 컬럼은 제외된다
--   is_partial    boolean  indpred  is not null  ← 🔴 이게 F-05 의 핵심 플래그
--   is_expression boolean  indexprs is not null
--   is_valid      boolean  indisvalid

create or replace function public.unique_indexes_for_table(p_table text)
returns table (index_name text, columns text[], is_partial boolean, is_expression boolean, is_valid boolean)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select
    i.relname::text,
    (select array_agg(a.attname::text order by a.attname)
       from unnest(x.indkey::int2[]) with ordinality as k(attnum, ord)
       join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
      where k.ord <= x.indnkeyatts),
    x.indpred   is not null,
    x.indexprs  is not null,
    x.indisvalid
  from pg_index x
  join pg_class     i on i.oid = x.indexrelid
  join pg_class     t on t.oid = x.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = p_table
    and x.indisunique
  order by i.relname;
$$;

revoke execute on function public.unique_indexes_for_table(text) from public, anon, authenticated;
grant  execute on function public.unique_indexes_for_table(text) to service_role;

notify pgrst, 'reload schema';

-- [적용 후 검증]
--   select * from public.unique_indexes_for_table('new_listings') order by index_name;
--   -- new_listings_molit_name_region_idx | {name,region} | is_partial = true  ← 부분 인덱스 구분 증거
--   select * from public.unique_indexes_for_table('favorites') order by index_name;
--   -- favorites_area_type_alert_unique_idx  | {area_type_id,complex_id,site_id,user_id} | true
--   -- favorites_complex_favorite_unique_idx | {complex_id,site_id,user_id}              | true
--   -- favorites_pkey                        | {id}                                     | false
