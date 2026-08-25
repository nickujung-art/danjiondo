-- successor 없는 merged 단지를 매칭 후보에서 제외한다 (2026-08-25)
--
-- ── 무엇이 새고 있나 ───────────────────────────────────────────────────────
-- 병합 관례는 3종 세트다(20260806080000): 참조를 옮기고 · source 를 status='merged' 로
-- 남기고 · **successor_id 를 반드시 넣는다.** 매칭 RPC 가 `COALESCE(successor_id, id)`
-- 로 돌려주므로 세 번째가 빠지면 그 COALESCE 가 무력해진다.
--
-- 그러면 단지는 `merged` 라 **앱 화면에서는 사라지는데**(앱은 status='active' 로 거른다)
-- 매칭 RPC 는 `status not in ('demolished','out_of_region')` 로만 걸러서 **후보로 남는다.**
-- 자기 id 를 반환하니 새 거래가 계속 그리로 붙는다 — 보이지 않는 흡인기다.
--
-- 2026-08-25 실측: `merged` + `successor_id IS NULL` 이 **19곳**. 지금은 갇힌 거래 0건이지만
-- (20260824100000 이 51건을 풀었다) 흡인기는 그대로다. 어제 형제상가빌라[48127] 의 거래
-- 4건을 끊었는데, 일배치가 전월·당월을 재수집하므로 **그대로 두면 도로 붙는다.**
-- 끊기가 durable 하지 않다는 뜻이다.
--
-- ── 왜 successor 를 채워서 풀지 않나 ───────────────────────────────────────
-- `merge-complexes.ts --propose-successors` 를 19곳에 돌린 결과:
--
--     명확 0곳 / 애매 11곳 / 후보없음 8곳
--
-- "애매" 11곳은 차수 가드가 정확히 막은 것들이다 — 부영e-그린6차→5차,
-- 대방성원3차→남양성원2차, 부산신항3단지→8단지. 거리는 가까워도 **다른 차수**라
-- successor 로 주면 그 자체가 1차/2차 뭉갬이 된다(CLAUDE.md CRITICAL).
-- **자신 있게 줄 수 있는 successor 가 하나도 없다.** 그래서 흡인을 막는 쪽이 답이다.
--
-- 제외하면 그 이름의 거래는 미연결로 떨어진다. 이게 더 정직하다 —
-- 숨겨진 단지에 붙으면 연결률 감시가 '연결됨' 으로 세어 건강을 과대평가하지만,
-- 미연결은 `check-ingest-linkage.ts` 지표에 잡히고 `complex_aliases` 한 줄로
-- 사람이 확정할 수 있다(20260824100000 이 이미 같은 논리를 썼다).
--
-- ── 술어를 한 군데로 뽑는다 ────────────────────────────────────────────────
-- 조건이 RPC 안 5곳에 나온다. 5번 복붙하면 한 곳만 고쳐지는 drift 가 생긴다 —
-- **오늘 아침에 고친 refresh_complex_canonical_jibun() 의 버그가 정확히 그것이었다**
-- (주석은 의도를 맞게 적었는데 술어가 다른 걸 검사했다). 반복하지 않는다.
--
-- 🔴 헬퍼에 `SET search_path` 를 걸지 않는다. SET 절이 있는 SQL 함수는 **인라인되지
--    않아** 행마다 실제 함수 호출이 된다. 이 헬퍼는 테이블을 참조하지 않고
--    SECURITY DEFINER 도 아니라서 search_path 고정의 보안 이득이 없다.
create or replace function public.complex_is_matchable(
  p_status       public.complex_status,
  p_successor_id uuid
)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_status not in ('demolished', 'out_of_region')
     and not (p_status = 'merged' and p_successor_id is null)
$$;

comment on function public.complex_is_matchable(public.complex_status, uuid) is
  '거래를 붙여도 되는 단지인가. demolished·out_of_region 은 제외하고, '
  'successor 없는 merged 도 제외한다(COALESCE 가 자기 id 를 돌려줘 숨겨진 단지에 '
  '거래가 쌓이기 때문). match_complex_by_admin 5개 지점이 공유한다.';

-- ── 매칭 RPC — 5개 지점이 헬퍼를 공유하도록 바꾼다 ─────────────────────────
-- 🔴 `SET search_path` 를 설정하지 않는다 — 원본과 동일하게 둔다. 본문이 pg_trgm 의
--    similarity/word_similarity 를 미수식으로 호출하므로 비우면 즉시 죽는다
--    (20260819030000·20260819050000 이 그 사고를 수습한 마이그레이션이다).
-- 🔴 인자 목록을 바꾸지 않으므로 DROP 하지 않는다. 바꿨다면 새 오버로드가 생겨
--    모호성 에러가 났을 것이다(Phase 38 HARD-03).
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
        where c.id = v_owner
          and public.complex_is_matchable(c.status, c.successor_id);
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
      and public.complex_is_matchable(c.status, c.successor_id)
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
    and public.complex_is_matchable(c.status, c.successor_id)
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
      and public.complex_is_matchable(c.status, c.successor_id)
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
      and public.complex_is_matchable(c.status, c.successor_id)
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
