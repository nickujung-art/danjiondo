-- 지번 게이트는 **지번이 유일할 때만** 작동한다 (2026-08-21)
--
-- ── 무엇이 잘못됐나 ────────────────────────────────────────────────────────
-- 20260821090000 이 넣은 지번 게이트가 `limit 1` 로 확정 단지를 골랐다. 그런데
-- **한 지번을 여러 단지가 공유하는 경우가 실재한다.** 실측 14그룹 / 31곳:
--
--   48250 외동 705       주공1(229건) / 주공2(232건)          ← 1차·2차
--   48250 구산동 410     김해구산4주공 / 구산5주공
--   48250 안동 BL-2-2    푸르지오 하이엔드 1단지 / 2차
--   48123 대원동 110     센트럴파크에일린의뜰 / 에일린의뜰1단지
--   26440 강동동 "가-"   4개 단지 공유 (블록 표기라 지번 구실을 못 한다)
--
-- `limit 1` 이면 외동 705 거래가 **전부 주공1 아니면 주공2 한쪽으로 쏠린다.**
-- 1차·2차를 가르려고 만든 장치가 오히려 1차·2차를 뭉개는 것이다.
--
-- `.planning/data-quality/matching-ambiguous-20260805.md` 가 이미 경고했다 —
-- *"`목연오피스텔2차`를 차수 없는 `목연오피스텔`에 붙이면 1차·2차가 한 단지로 뭉개진다"*.
--
-- ── 고침 ───────────────────────────────────────────────────────────────────
-- 지번이 **정확히 한 단지**를 가리킬 때만 게이트가 작동한다. 충돌하면 게이트를 끄고
-- 기존 이름 매칭에 맡긴다 — 차수가 이름에 들어 있으면(주공1/주공2) 이름이 오히려
-- 정확한 근거다.
--
-- 즉 두 근거가 **상호 보완**한다:
--   지번이 다르다 → 지번이 정확하다 (이름이 같아도 갈린다)
--   지번이 같다   → 이름이 정확하다 (차수로 갈린다)
--
-- 충돌 그룹은 `complex_canonical_jibun_collisions` 뷰로 노출해 사람이 볼 수 있게 한다.

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
  -- ── 지번 게이트 ─────────────────────────────────────────────────────────
  -- 🔴 지번이 **정확히 한 단지**를 가리킬 때만 작동한다. 여럿이면 끈다.
  if p_jibun is not null and p_umd_nm is not null then
    select count(*), min(j.complex_id)
      into v_owners, v_owner
    from public.complex_canonical_jibun j
    where j.sgg_code = p_sgg_code
      and j.umd_nm   = p_umd_nm
      and j.jibun    = p_jibun;

    if v_owners = 1 and v_owner is not null then
      return query
        select coalesce(c.successor_id, c.id), c.canonical_name, 1.0::numeric
        from public.complexes c
        where c.id = v_owner and c.status != 'demolished';
      if found then return; end if;
    end if;
    -- v_owners > 1 이면 아무것도 하지 않는다 → 아래 이름 매칭으로 내려간다
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

-- ── 충돌 그룹을 보이게 한다 ────────────────────────────────────────────────
-- 게이트가 꺼지는 지번들이다. 이름에 차수가 없으면 여기가 오매칭의 잔여 위험 구간이므로
-- 사람이 주기적으로 봐야 한다. 대부분은 (a) 1차·2차가 실제로 같은 지번이거나
-- (b) 같은 단지가 중복 등록됐거나 (c) 지번이 블록 표기라 구실을 못 하는 경우다.
create or replace view public.complex_canonical_jibun_collisions as
select
  j.sgg_code,
  j.umd_nm,
  j.jibun,
  count(*)                                      as complex_count,
  array_agg(c.canonical_name order by j.tx_count desc)  as names,
  array_agg(j.tx_count      order by j.tx_count desc)   as tx_counts,
  array_agg(c.household_count order by j.tx_count desc) as households
from public.complex_canonical_jibun j
join public.complexes c on c.id = j.complex_id
group by j.sgg_code, j.umd_nm, j.jibun
having count(*) > 1;

comment on view public.complex_canonical_jibun_collisions is
  '한 지번을 여러 단지가 확정지번으로 갖는 그룹. 이 지번들은 지번 게이트가 꺼지고 이름 매칭에 의존한다 — 이름에 차수가 없으면 오매칭 위험 구간이다.';
