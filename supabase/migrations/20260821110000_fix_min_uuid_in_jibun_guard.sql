-- 지번 게이트의 `min(uuid)` 를 제거한다 — 함수가 호출 즉시 죽고 있었다 (2026-08-21)
--
-- ── 증상 ───────────────────────────────────────────────────────────────────
-- 20260821100000 이 유일성 검사를 넣으면서 이렇게 썼다:
--
--     select count(*), min(j.complex_id) into v_owners, v_owner ...
--
-- **PostgreSQL 에는 `min(uuid)` 집계 함수가 없다.** uuid 는 순서 비교 연산자를 갖지만
-- min/max 집계는 정의돼 있지 않다. 그래서 `match_complex_by_admin` 이 **어떤 인자로도
-- 호출 즉시 실패**했다:
--
--     ERR function min(uuid) does not exist
--
-- 같은 파일의 2·3단계는 원래 `min(...::text)::uuid` 로 캐스팅해 이 문제를 피하고 있었다.
-- 유일성 검사를 새로 쓰면서 그 관례를 따르지 않은 것이 원인이다.
--
-- ── 왜 즉시 드러났나 ───────────────────────────────────────────────────────
-- 적용 직후 게이트 동작을 실제로 호출해 검증했기 때문이다. 마이그레이션이 성공했다는
-- 것과 함수가 동작한다는 것은 다르다 — `CREATE FUNCTION` 은 본문의 함수 해석을
-- 실행 시점까지 미룬다(plpgsql 은 지연 바인딩이다). 이 저장소가 20260819030000 에서
-- 겪은 것과 같은 부류다: *"search_path='' 인데 미수식 참조라 호출 즉시 죽던 함수 2개"*.
--
-- **교훈: 함수를 바꾸면 반드시 호출해서 확인한다. push 성공은 검증이 아니다.**
--
-- ── 고침 ───────────────────────────────────────────────────────────────────
-- 유일성은 `count(*)` 로 재고, 단지 id 는 집계 없이 별도 조회한다.
-- (`min(x::text)::uuid` 도 가능하지만, 여기서는 행이 하나임을 이미 아는 상황이라
--  그냥 다시 읽는 편이 의도가 분명하다.)

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
        where c.id = v_owner and c.status != 'demolished';
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
      and c.status != 'demolished'
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
    and c.status != 'demolished'
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
      and c.status != 'demolished'
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
      and c.status != 'demolished'
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
