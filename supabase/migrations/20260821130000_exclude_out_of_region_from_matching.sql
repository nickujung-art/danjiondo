-- 매칭 후보에서 out_of_region 단지를 제외한다 (2026-08-21)
--
-- 20260821120000 이 enum 에 `out_of_region` 을 추가했다. 그런데 매칭 RPC 의 기존 조건은
-- `status != 'demolished'` 라서 **out_of_region 단지를 여전히 후보로 삼는다.**
-- 그대로 두면 P1-a 처리로 거래를 끊어도 다음 적재가 같은 단지에 다시 붙인다.
--
-- 🔴 별도 마이그레이션인 이유: PostgreSQL 은 `ALTER TYPE ... ADD VALUE` 로 추가한 값을
--    **같은 트랜잭션 안에서 사용할 수 없다.** supabase db push 가 마이그레이션을
--    트랜잭션으로 감싸므로 enum 추가와 값 사용을 한 파일에 둘 수 없다.
--
-- 조건을 `not in ('demolished', 'out_of_region')` 으로 넓힌다 (5곳).

create or replace function public.match_complex_by_admin(
  p_sgg_code text,
  p_name_normalized text,
  p_min_similarity numeric default 0.9,
  p_umd_nm text default null::text,
  p_jibun text default null::text
)
returns table(id uuid, canonical_name text, trgm_sim numeric)
language plpgsql
as $$
declare
  v_count int;
  v_id    uuid;
  v_name  text;
  v_owner uuid;
  v_owners int;
  v_cand  uuid;
  v_cname text;
  v_sim   numeric;
begin
  -- ── 지번 게이트 — 지번이 정확히 한 단지를 가리킬 때만 작동한다 ──────────
  if p_jibun is not null and p_umd_nm is not null then
    select count(*) into v_owners
    from public.complex_canonical_jibun j
    where j.sgg_code = p_sgg_code
      and j.umd_nm   = p_umd_nm
      and j.jibun    = p_jibun;

    if v_owners = 1 then
      select j.complex_id into v_owner
      from public.complex_canonical_jibun j
      where j.sgg_code = p_sgg_code
        and j.umd_nm   = p_umd_nm
        and j.jibun    = p_jibun;

      return query
        select coalesce(c.successor_id, c.id), c.canonical_name, 1.0::numeric
        from public.complexes c
        where c.id = v_owner and c.status not in ('demolished', 'out_of_region');
      if found then return; end if;
    end if;
    -- 충돌(v_owners > 1)이면 게이트를 끄고 이름 매칭으로 내려간다.
    -- 1차·2차가 같은 지번을 쓰는 경우가 여기다 — 그때는 이름이 정확한 근거다.
  end if;

  -- 0단계: 별칭 정확 일치
  return query
    select coalesce(c.successor_id, c.id), c.canonical_name, 1.0::numeric
    from public.complex_aliases a
    join public.complexes c on c.id = a.complex_id
    where public.name_normalize_sql(a.alias_name) = p_name_normalized
      and c.sgg_code = p_sgg_code
      and c.status not in ('demolished', 'out_of_region')
    order by a.confidence desc nulls last
    limit 1;
  if found then return; end if;

  -- 1단계: 3방향 trigram
  select coalesce(c.successor_id, c.id), c.canonical_name,
         greatest(
           similarity(c.name_normalized, p_name_normalized),
           word_similarity(p_name_normalized, c.name_normalized),
           word_similarity(c.name_normalized, p_name_normalized)
         )::numeric
    into v_cand, v_cname, v_sim
  from public.complexes c
  where c.sgg_code = p_sgg_code
    and c.status not in ('demolished', 'out_of_region')
    and greatest(
          similarity(c.name_normalized, p_name_normalized),
          word_similarity(p_name_normalized, c.name_normalized),
          word_similarity(c.name_normalized, p_name_normalized)
        ) >= p_min_similarity
  order by 3 desc
  limit 1;

  if v_cand is not null then
    return query select v_cand, v_cname, v_sim;
    return;
  end if;

  -- 2단계: 양방향 LIKE unique
  if length(p_name_normalized) >= 2 then
    select count(*), min(coalesce(c.successor_id, c.id)::text)::uuid, min(c.canonical_name)
    into v_count, v_id, v_name
    from public.complexes c
    where c.sgg_code = p_sgg_code
      and c.status not in ('demolished', 'out_of_region')
      and (
        c.name_normalized like '%' || p_name_normalized || '%'
        or (length(c.name_normalized) >= 4
            and p_name_normalized like '%' || c.name_normalized || '%')
      );
    if v_count = 1 then
      return query select v_id, v_name, 0.90::numeric;
      return;
    end if;
  end if;

  -- 3단계: 동 필터 + LIKE unique
  if p_umd_nm is not null and length(p_name_normalized) >= 2 then
    select count(*), min(coalesce(c.successor_id, c.id)::text)::uuid, min(c.canonical_name)
    into v_count, v_id, v_name
    from public.complexes c
    where c.sgg_code = p_sgg_code
      and c.status not in ('demolished', 'out_of_region')
      and c.dong = p_umd_nm
      and (
        c.name_normalized like '%' || p_name_normalized || '%'
        or (length(c.name_normalized) >= 4
            and p_name_normalized like '%' || c.name_normalized || '%')
      );
    if v_count = 1 then
      return query select v_id, v_name, 0.90::numeric;
    end if;
  end if;
end;
$$;
