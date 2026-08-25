-- 확정 지번 갱신 — 자격을 잃은 행을 실제로 걷어낸다 (2026-08-25)
--
-- ── 무엇이 고장나 있었나 ───────────────────────────────────────────────────
-- 20260821090000 의 refresh_complex_canonical_jibun() 은 삭제 절을 갖고 있었고
-- 주석도 의도를 정확히 적어 두었다:
--
--   "더 이상 확정 조건을 만족하지 않는 단지는 걷어낸다(오염이 늘어 다수결이 깨진 경우)"
--
-- 그런데 술어가 다른 것을 검사했다 — **유효 거래가 0건인 단지만** 지운다.
-- 다수결이 깨졌어도 거래가 1건이라도 남아 있으면 살아남는다.
-- 갱신은 `insert … on conflict do update` 뿐이라 winners 에서 빠진 단지는
-- upsert 대상이 아니고, 그래서 **옛 값이 옛 computed_at 그대로 남는다.**
--
-- ── 왜 없는 것보다 나쁜가 ──────────────────────────────────────────────────
-- 게이트는 이 테이블을 "이 지번은 저 단지 것"이라는 확정 근거로 쓴다.
-- 값이 낡으면 게이트는 **현재 2위인 지번을 확정으로 주장**한다. 2026-08-25 실측:
--
--   남산빌라[의창구]    저장 팔용동 173-6  ←→ 실제 1위 중동 447-1      12 vs 10  (동이 다름)
--   다사랑빌[부산 중구] 저장 부평동4가 20-11 ←→ 실제 1위 보수동2가 72-15 23 vs 22
--   5지구몰운대[사하구] 저장 당리동 329-4   ←→ 실제 1위 구평동 35-7      2 vs 1
--
-- 이 상태에서 팔용동 173-6 거래가 들어오면 게이트가 이름 매칭을 눌러 남산빌라로
-- 확정한다. 정작 남산빌라 자신의 거래 다수는 중동에 있다. **오연결 증폭기다.**
--
-- 12행이 이 상태였다. 두 갈래로 생긴다:
--   (a) relink 로 거래가 빠져나가 껍데기만 남음 — 당리삼성타워 44건→1건 등
--   (b) 지번 백필이 지번을 채우자 다수결이 쪼개짐 — 더블리안 92/197(47%) 등
-- (b) 는 그 자체로 전건 오연결 신호이기도 하다(동이 갈린다).
--
-- ── 고치는 방법 ────────────────────────────────────────────────────────────
-- winners 를 한 번만 정의하고 upsert 와 delete 가 **같은 정의를 공유**하게 한다.
-- 정의를 두 벌로 복사하면 바로 그 drift 가 이 버그의 원인이므로 반복하지 않는다.
-- data-modifying CTE 는 이를 한 문장으로 만들어 준다 — CTE 는 문장 전체에서 보이고
-- 정확히 한 번 실행된다.
--
-- 안전성: upsert 는 winner 행을, delete 는 non-winner 행을 건드린다. **서로소**이므로
-- "같은 행을 두 갈래에서 수정" 이라는 CTE 금기에 걸리지 않는다.
-- delete 는 문장 시작 스냅샷을 보므로 이번에 새로 insert 된 행은 아예 보이지 않는다
-- (보이더라도 winner 라 삭제 대상이 아니다).

create or replace function public.refresh_complex_canonical_jibun()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows    integer;
  v_deleted integer;
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
  -- 다수 비율 0.6 이상 + 표본 5건 이상일 때만 확정으로 인정한다.
  -- 이 임계는 scripts/relink-transactions-by-jibun.ts 의 DOMINANT_RATIO/MIN_SAMPLE 과 같다.
  winners as (
    select complex_id, sgg_code, umd_nm, jibun, tx_count, total_count,
           (tx_count::numeric / total_count) as ratio
    from counted
    where rn = 1
      and total_count >= 5
      and (tx_count::numeric / total_count) >= 0.6
  ),
  upserted as (
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
      computed_at = excluded.computed_at
    returning 1
  ),
  -- 자격을 잃은 행을 걷어낸다. 거래가 0건인 경우(껍데기)도 winners 에 없으므로
  -- 여기에 함께 걸린다 — 옛 버전의 별도 delete 절은 이 조건에 흡수된다.
  pruned as (
    delete from public.complex_canonical_jibun c
    where not exists (
      select 1 from winners w where w.complex_id = c.complex_id
    )
    returning 1
  )
  select (select count(*) from upserted), (select count(*) from pruned)
  into v_rows, v_deleted;

  -- 조용히 지우지 않는다 — 배치 로그에 남긴다.
  if v_deleted > 0 then
    raise notice 'refresh_complex_canonical_jibun: % 행 확정, % 행 자격상실로 삭제', v_rows, v_deleted;
  end if;

  return v_rows;
end;
$$;

comment on function public.refresh_complex_canonical_jibun() is
  '거래 다수결로 단지 확정 지번을 갱신하고, 자격을 잃은 행은 삭제한다. 일배치·백필 뒤에 호출한다.';

revoke execute on function public.refresh_complex_canonical_jibun() from public, anon, authenticated;
grant execute on function public.refresh_complex_canonical_jibun() to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'backup_agent') then
    grant execute on function public.refresh_complex_canonical_jibun() to backup_agent;
  end if;
end $$;
