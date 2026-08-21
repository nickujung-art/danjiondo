-- 거래↔단지 매칭에 지번 게이트를 추가한다 (2026-08-21)
--
-- ── 무엇이 문제였나 ────────────────────────────────────────────────────────
-- `match_complex_by_admin` 이 **이름만으로** 거래를 단지에 붙인다. 동(umd_nm)은 3단계에서만
-- 보는데 대부분은 1단계 trigram(>=0.9)에서 확정되므로 사실상 이름 단독 매칭이다.
-- CLAUDE.md 가 CRITICAL 로 못박은 "단지명 단독 매칭 금지" 가 **거래 연결 경로에서는
-- 지켜지지 않고 있었다.**
--
-- 2026-08-21 전수 조사 실측(운영권역 + 부산, 카카오 63회 교차검증):
--   시영장미(내서읍 중리)   ← 양덕동 54-3  거래 67건   **7,544m** 떨어진 곳
--   반림럭키(반림동 8)      ← 가음동 14-5  거래 319건  3,918m
--   구지마을동원(구산동)    ← 삼방동 690-1 거래 158건  3,966m
--   SKVIEW(반여동)          ← 중동 1787    거래 123건  6,657m
-- 정리 결과 1,659건을 올바른 단지로 옮기거나 끊었다.
--
-- ── 왜 "동 필터"가 답이 아닌가 ─────────────────────────────────────────────
-- 1단계에 `c.dong = p_umd_nm` 을 넣으면 정상 데이터가 무너진다. 실측 반례:
--   율현마을율하e편한세상  율하동 1405 외 다필지 — 506건
--   창원롯데캐슬센텀골드   양덕동 166-44 외      —  80건
--   대동다숲아파트         내서읍 원계리/삼계리  — 카카오 실측 **0m, 같은 부지**
--   김해센텀두산위브       주촌면 천곡리/선지리  — **72m, 같은 부지**
-- 큰 단지는 여러 필지·여러 법정동에 걸친다. 동을 강제하면 이들이 미연결로 떨어진다.
-- 기존 주석("동 필터 없음 — 기존 매칭 회귀 방지")의 판단은 옳았다.
--
-- ── 그래서: 필터가 아니라 게이트 ───────────────────────────────────────────
-- 매칭 후보는 그대로 뽑되, **그 지번이 다른 단지의 확정 지번일 때만 거부**한다.
--
--   지번 (sgg, umd, jibun) 이 단지 A 의 확정 지번인데
--   이름 매칭이 단지 B 를 골랐다  →  거부한다 (미연결로 떨어뜨린다)
--
-- 이 규칙은 다필지·경계 단지를 건드리지 않는다. 그런 지번은 애초에 **어느 단지의
-- 확정 지번도 아니거나**, 바로 그 단지 자신의 것이기 때문이다.
--
-- 미연결은 조용한 실패가 아니다 — `check-ingest-linkage.ts` 가 연결률로 감시하고,
-- `complex_aliases` 에 한 줄 넣으면 사람이 확정할 수 있다.
--
-- ── 확정 지번을 어디서 얻나 ────────────────────────────────────────────────
-- 거래 자신이다. 한 단지에 붙은 거래의 **다수 지번**이 그 단지의 실제 위치다
-- (오염은 정의상 소수라 다수결이 성립한다). `complexes.jibun_address` 는 운영권역
-- 60.4% 뿐이라 단독 근거로 쓸 수 없다.
--
-- 매 호출마다 다수결을 계산하면 비싸므로 **테이블로 물질화**하고 배치가 갱신한다.

-- ── 확정 지번 테이블 ───────────────────────────────────────────────────────
create table if not exists public.complex_canonical_jibun (
  complex_id  uuid primary key references public.complexes(id) on delete cascade,
  sgg_code    text        not null,
  umd_nm      text,
  jibun       text,
  tx_count    integer     not null,
  total_count integer     not null,
  ratio       numeric     not null,
  computed_at timestamptz not null default now()
);

comment on table public.complex_canonical_jibun is
  '단지의 확정 지번 — 붙어 있는 거래의 다수결로 도출한다. match_complex_by_admin 의 지번 게이트가 참조한다. refresh_complex_canonical_jibun() 이 갱신.';

-- 게이트가 (sgg, umd, jibun) 으로 역조회하므로 그 조합에 인덱스를 둔다.
-- 🔴 CONCURRENTLY 를 쓰지 않는다 — npm run db:push 가 마이그레이션을 트랜잭션으로
--    감싸므로 CONCURRENTLY 는 실행 자체가 불가능하다(CLAUDE.md CRITICAL).
create index if not exists complex_canonical_jibun_lookup_idx
  on public.complex_canonical_jibun (sgg_code, umd_nm, jibun);

alter table public.complex_canonical_jibun enable row level security;

-- 읽기는 공개(단지 위치 정보이며 민감하지 않다). 쓰기는 service_role 만.
-- 🔴 TO 절을 명시한다 — 생략하면 TO public 이 되어 의도가 흐려진다(CLAUDE.md CRITICAL).
drop policy if exists complex_canonical_jibun_read on public.complex_canonical_jibun;
create policy complex_canonical_jibun_read
  on public.complex_canonical_jibun for select
  to anon, authenticated
  using (true);

drop policy if exists complex_canonical_jibun_write on public.complex_canonical_jibun;
create policy complex_canonical_jibun_write
  on public.complex_canonical_jibun for all
  to authenticated
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── 갱신 함수 ──────────────────────────────────────────────────────────────
-- 다수 비율 0.6 이상 + 표본 5건 이상일 때만 확정으로 인정한다.
-- 이 임계는 scripts/relink-transactions-by-jibun.ts 의 DOMINANT_RATIO/MIN_SAMPLE 과 같다.
create or replace function public.refresh_complex_canonical_jibun()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  -- 🔴 취소·정정 거래를 제외한다 (CLAUDE.md CRITICAL)
  with counted as (
    select
      t.complex_id,
      t.sgg_code,
      t.umd_nm,
      t.jibun,
      count(*)                                          as tx_count,
      sum(count(*)) over (partition by t.complex_id)    as total_count,
      row_number() over (partition by t.complex_id order by count(*) desc) as rn
    from public.transactions t
    where t.complex_id is not null
      and t.jibun is not null
      and t.cancel_date is null
      and t.superseded_by is null
    group by t.complex_id, t.sgg_code, t.umd_nm, t.jibun
  ),
  winners as (
    select complex_id, sgg_code, umd_nm, jibun, tx_count, total_count,
           (tx_count::numeric / total_count) as ratio
    from counted
    where rn = 1
      and total_count >= 5
      and (tx_count::numeric / total_count) >= 0.6
  )
  insert into public.complex_canonical_jibun
    (complex_id, sgg_code, umd_nm, jibun, tx_count, total_count, ratio, computed_at)
  select complex_id, sgg_code, umd_nm, jibun, tx_count, total_count, ratio, now()
  from winners
  on conflict (complex_id) do update set
    sgg_code    = excluded.sgg_code,
    umd_nm      = excluded.umd_nm,
    jibun       = excluded.jibun,
    tx_count    = excluded.tx_count,
    total_count = excluded.total_count,
    ratio       = excluded.ratio,
    computed_at = excluded.computed_at;

  get diagnostics v_rows = row_count;

  -- 더 이상 확정 조건을 만족하지 않는 단지는 걷어낸다(오염이 늘어 다수결이 깨진 경우).
  delete from public.complex_canonical_jibun c
  where not exists (
    select 1 from public.transactions t
    where t.complex_id = c.complex_id
      and t.cancel_date is null and t.superseded_by is null
  );

  return v_rows;
end;
$$;

comment on function public.refresh_complex_canonical_jibun() is
  '거래 다수결로 단지 확정 지번을 갱신한다. 일배치·백필 뒤에 호출한다.';

revoke execute on function public.refresh_complex_canonical_jibun() from public, anon, authenticated;

-- ── 지번 게이트를 얹은 매칭 함수 ───────────────────────────────────────────
-- 기존 0~3단계는 **그대로 둔다.** 앞에 지번 확정 판정만 덧댄다.
--
-- 🔴 인자를 하나 늘리므로 **기존 4인자 시그니처를 반드시 DROP 한다.**
-- CREATE OR REPLACE 는 인자 목록이 다르면 교체가 아니라 **새 오버로드**를 만든다.
-- 이 저장소는 이미 그 사고를 겪었다 — `recommend_hagwons` 가 `p_fee_tier text` 와
-- `p_fee_tiers text[]` 두 벌로 공존해 인자 미명시 호출 시 모호성 에러 위험이 있었다
-- (Phase 38 HARD-03). 같은 실수를 반복하지 않는다.
drop function if exists public.match_complex_by_admin(text, text, numeric, text);

-- 🔴 `SET search_path` 를 설정하지 않는다 — 원본과 동일하게 둔다.
-- 본문이 pg_trgm 의 `similarity`/`word_similarity` 를 호출하는데, search_path 를 비우면
-- 확장 함수 해석이 깨진다. 20260819030000·20260819050000 이 정확히 그 사고
-- ("search_path='' 인데 미수식 참조라 호출 즉시 죽던 함수 2개")를 수습한 마이그레이션이다.
-- 이 함수는 SECURITY DEFINER 도 아니므로(호출자 권한으로 실행) search_path 고정의
-- 보안 이득도 없다. **동작하는 것을 이유 없이 바꾸지 않는다.**
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
  v_cand  uuid;
  v_cname text;
  v_sim   numeric;
begin
  -- ── 지번 게이트 (0단계보다 먼저 계산해 둔다) ────────────────────────────
  -- 이 지번이 **다른 단지의 확정 지번**이면, 이름 매칭 결과를 거부한다.
  -- 지번이 어느 단지의 확정 지번도 아니면(다필지·신규 단지) v_owner 는 null 이고
  -- 게이트는 아무 일도 하지 않는다.
  v_owner := null;
  if p_jibun is not null and p_umd_nm is not null then
    select j.complex_id into v_owner
    from public.complex_canonical_jibun j
    where j.sgg_code = p_sgg_code
      and j.umd_nm   = p_umd_nm
      and j.jibun    = p_jibun
    limit 1;

    -- 확정 소유 단지가 있으면 그 단지로 바로 확정한다. 이름 매칭보다 강한 근거다.
    if v_owner is not null then
      return query
        select coalesce(c.successor_id, c.id), c.canonical_name, 1.0::numeric
        from public.complexes c
        where c.id = v_owner and c.status != 'demolished';
      if found then return; end if;
    end if;
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

-- 초기 적재. 이후에는 배치가 부른다.
select public.refresh_complex_canonical_jibun();
