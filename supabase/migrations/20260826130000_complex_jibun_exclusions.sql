-- 지번 게이트에 **부정 근거**를 담는다 (2026-08-26)
--
-- ── 무엇이 비어 있었나 ─────────────────────────────────────────────────────
-- 지번 게이트(20260821090000)는 **긍정 정보만** 담는다:
--
--     "(sgg, umd, jibun) 은 단지 X 의 확정 지번이다"  →  X 로 확정한다
--
-- 그런데 **"(sgg, umd, jibun) 은 단지 X 것이 **아니다**" 를 담을 자리가 없다.**
-- 게이트는 그 지번의 확정 주인이 정확히 1곳일 때만 발화하고, 0곳이면 침묵한 뒤
-- 이름 매칭으로 내려간다.
--
-- 그래서 **끊기가 durable 하지 않다.** 오연결을 끊으면:
--   ① 그 단지의 해당 거래가 사라진다
--   ② 확정 지번 재계산 → 그 (동,지번)의 주인이 0곳이 된다
--   ③ 게이트가 침묵한다
--   ④ 이름 매칭이 원래 단지를 다시 반환한다  ← 원상복구
--
-- **끊는 행위 자체가 게이트를 무력화한다.**
--
-- ── 실측 (2026-08-26) ──────────────────────────────────────────────────────
-- 그날 끊은 8,628건을 검사했다:
--
--   끊은 (동,지번) 묶음 222개 중 게이트 보호 42개 / 무보호 180개 (거래 5,603건)
--   상위 40묶음을 **실제 raw_complex_name 으로** 재매칭 → 37개(3,943건)가 원래 단지로 복귀
--
--   창원대우(1차)아파트 + 상남동 63  → 창원대우(1차)아파트  (sim 0.9)
--   내동주공1단지 + 신월동 90        → 내동주공1단지        (sim 1)
--   화인 + 완월동 478               → 화인                (sim 1)
--
-- 반면 **이동(move)은 보호된다** — 목표가 그 지번의 새 주인이 되어 게이트가 발화한다.
-- 즉 이 테이블이 필요한 것은 **끊기** 쪽이다.
--
-- ── 왜 complex_aliases 의 반대인가 ─────────────────────────────────────────
-- `complex_aliases` 는 "이 이름은 저 단지다" 를 넣는 자리다. 그 반대가 없었다.
-- 다만 이름이 아니라 **(단지, 동, 지번)** 단위로 담는다 — relink-verified 가 이미
-- 그 단위로 판정하고 이동·끊기하므로 근거와 저장 단위가 일치한다.
--
-- ── 안전장치 ───────────────────────────────────────────────────────────────
-- `basis` 를 NOT NULL 로 강제한다. 근거 없는 제외는 넣을 수 없다 —
-- relink-verified 의 `--in-decided` 가 basis 를 요구하는 것과 같은 규율이다.
-- 잘못 넣었으면 그 행을 지우면 즉시 원복된다.

create table if not exists public.complex_jibun_exclusions (
  complex_id  uuid        not null references public.complexes(id) on delete cascade,
  sgg_code    text        not null,
  umd_nm      text        not null,
  jibun       text        not null,
  -- 🔴 왜 제외했는가. 비워 둘 수 없다.
  basis       text        not null,
  -- 어떤 도구·판정에서 나왔는가 (relink-verified --in-minor 등)
  source      text        not null,
  created_at  timestamptz not null default now(),
  primary key (complex_id, sgg_code, umd_nm, jibun),
  constraint complex_jibun_exclusions_basis_not_blank check (length(btrim(basis)) > 0)
);

comment on table public.complex_jibun_exclusions is
  '지번 게이트의 부정 근거 — "이 (동,지번) 은 이 단지 것이 아니다". 끊은 오연결이 '
  '재수집으로 되살아나는 것을 막는다. match_complex_by_admin 이 참조한다.';

-- 게이트가 (sgg, umd, jibun) 으로 역조회한다.
-- 🔴 CONCURRENTLY 를 쓰지 않는다 — db push 가 트랜잭션으로 감싼다(CLAUDE.md CRITICAL).
create index if not exists complex_jibun_exclusions_lookup_idx
  on public.complex_jibun_exclusions (sgg_code, umd_nm, jibun);

alter table public.complex_jibun_exclusions enable row level security;

-- 🔴 TO 절을 명시한다 (CLAUDE.md CRITICAL).
-- 읽기: match_complex_by_admin 은 SECURITY DEFINER 가 아니라 **호출자 권한**으로 돈다.
--       적재 경로는 service_role 이지만 anon/authenticated 가 RPC 를 부를 수도 있으므로
--       읽기를 열어 둔다(단지 위치 정보이며 민감하지 않다).
drop policy if exists complex_jibun_exclusions_read on public.complex_jibun_exclusions;
create policy complex_jibun_exclusions_read
  on public.complex_jibun_exclusions for select
  to anon, authenticated
  using (true);

drop policy if exists complex_jibun_exclusions_write on public.complex_jibun_exclusions;
create policy complex_jibun_exclusions_write
  on public.complex_jibun_exclusions for all
  to authenticated
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── 술어를 확장한다 ────────────────────────────────────────────────────────
-- 🔴 인자 목록이 바뀌므로 **기존 2인자 버전을 반드시 DROP 한다.**
--    CREATE OR REPLACE 는 인자가 다르면 교체가 아니라 새 오버로드를 만들고,
--    그러면 호출이 모호해진다(Phase 38 HARD-03 선례: recommend_hagwons 가
--    text 와 text[] 두 벌로 공존했다).
--    호출부는 match_complex_by_admin 하나뿐이며 아래에서 함께 갱신한다.
drop function if exists public.complex_is_matchable(public.complex_status, uuid);

-- 🔴 SET search_path 를 걸지 않는다 — SET 절이 있는 SQL 함수는 인라인되지 않아
--    행마다 실제 호출이 된다. 테이블을 참조하지 않고 SECURITY DEFINER 도 아니다.
create or replace function public.complex_is_matchable(
  p_id           uuid,
  p_status       public.complex_status,
  p_successor_id uuid,
  p_excluded     uuid[]
)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_status not in ('demolished', 'out_of_region')
     and not (p_status = 'merged' and p_successor_id is null)
     and not (p_id = any(coalesce(p_excluded, '{}'::uuid[])))
$$;

comment on function public.complex_is_matchable(uuid, public.complex_status, uuid, uuid[]) is
  '거래를 붙여도 되는 단지인가. demolished·out_of_region 제외, successor 없는 merged 제외, '
  '그리고 **이 (동,지번) 에서 제외된 단지**(complex_jibun_exclusions) 제외. '
  'match_complex_by_admin 5개 지점이 공유한다.';

-- ── 매칭 RPC ───────────────────────────────────────────────────────────────
-- 🔴 SET search_path 를 설정하지 않는다 — 본문이 pg_trgm 의 similarity/word_similarity 를
--    미수식으로 호출하므로 비우면 즉시 죽는다(20260819030000·20260819050000 이 그 사고를
--    수습한 마이그레이션이다).
-- 🔴 인자 목록은 그대로이므로 DROP 하지 않는다.
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
  v_excl  uuid[] := '{}'::uuid[];
begin
  -- ── 이 (동,지번) 에서 제외된 단지를 **한 번만** 모은다 ──────────────────
  -- 행마다 테이블을 조회하면 1단계 trigram 스캔에서 비싸다. 배열 멤버십은 싸다.
  if p_jibun is not null and p_umd_nm is not null then
    select coalesce(array_agg(e.complex_id), '{}'::uuid[]) into v_excl
    from public.complex_jibun_exclusions e
    where e.sgg_code = p_sgg_code
      and e.umd_nm   = p_umd_nm
      and e.jibun    = p_jibun;
  end if;

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
          and public.complex_is_matchable(c.id, c.status, c.successor_id, v_excl);
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
      and public.complex_is_matchable(c.id, c.status, c.successor_id, v_excl)
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
    and public.complex_is_matchable(c.id, c.status, c.successor_id, v_excl)
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
      and public.complex_is_matchable(c.id, c.status, c.successor_id, v_excl)
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
      and public.complex_is_matchable(c.id, c.status, c.successor_id, v_excl)
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
