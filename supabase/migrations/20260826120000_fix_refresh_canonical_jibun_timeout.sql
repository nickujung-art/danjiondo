-- refresh_complex_canonical_jibun() 이 PostgREST 8초 제한에 걸리던 것을 고친다 (2026-08-26)
--
-- ── 무엇이 고장났나 — 오늘 아침 내가 만든 회귀다 ──────────────────────────
-- 20260825090000 이 "winners 를 한 번만 정의하고 upsert 와 delete 가 공유한다" 는
-- 취지로 data-modifying CTE 를 썼다. 취지는 옳았지만 **delete 가 느려졌다**:
--
--     delete from complex_canonical_jibun c
--     where not exists (select 1 from winners w where w.complex_id = c.complex_id)
--
-- `winners` 는 CTE 라 인덱스가 없다. 3,747행 × 3,747 winners 를 대조하게 되고,
-- 전체 실행이 8초를 넘겼다. 원래 버전의 delete 는 `transactions` 를 인덱스로 조회해
-- 이 비용이 없었다.
--
-- 결과는 **조용한 실패**였다. PostgREST 는 8초에서 statement timeout 을 내는데,
-- supabase-js 로 부르면 그냥 null 이 돌아온다. 2026-08-26 작업 중 relink 뒤에 부른
-- 재계산이 전부 무위로 돌아갔고, 확정 지번이 02:45 UTC 에 멈춘 채 **지번 게이트가
-- 낡은 근거로 동작**했다. (나는 그 null 을 "PostgREST 파싱 문제" 로 오판했다.)
--
-- 야간 워크플로(refresh-price-stats.yml)는 psql 직결이라 statement_timeout 이 없어
-- 영향을 받지 않았다 — 그래서 더 늦게 드러났다.
--
-- ── 고치는 방법 ────────────────────────────────────────────────────────────
-- winners 공유라는 취지는 유지하되 **두 문장으로 나눈다.**
--
--   ① upsert 는 모든 winner 에 `computed_at = now()` 를 찍는다
--   ② 그다음 `computed_at <> now()` 인 행을 지운다
--
-- `now()` 는 트랜잭션 시각이라 한 호출 안에서 고정이다. 따라서 ②는 "이번에 손대지
-- 않은 행" 을 정확히 고른다 — 조인이 없어 O(n) 이고, winners 정의는 여전히 한 벌이다.
--
-- 🔴 한 문장 안의 data-modifying CTE 로는 이걸 못 한다. 같은 문장의 DELETE 는 문장
--    시작 스냅샷을 보므로 INSERT 가 찍은 computed_at 이 보이지 않는다. 그래서 나눈다.
--
-- 전제: 이 테이블에 쓰는 것은 이 함수뿐이다(revoke/grant 로 강제). 다른 writer 가
-- 생기면 이 방식은 그 행을 지운다 — 그때는 방식을 바꿔야 한다.

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
  -- ① 다수결 winner 를 upsert 한다. 🔴 취소·정정 거래를 제외한다 (CLAUDE.md CRITICAL)
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

  -- ② 이번에 손대지 않은 행 = 자격을 잃은 행. 조인 없이 O(n).
  --    거래가 0건이 된 껍데기도 winner 가 아니므로 여기에 함께 걸린다.
  delete from public.complex_canonical_jibun
  where computed_at <> now();

  get diagnostics v_deleted = row_count;

  -- 조용히 지우지 않는다 — 배치 로그에 남긴다.
  if v_deleted > 0 then
    raise notice 'refresh_complex_canonical_jibun: % 행 확정, % 행 자격상실로 삭제', v_rows, v_deleted;
  end if;

  return v_rows;
end;
$$;

comment on function public.refresh_complex_canonical_jibun() is
  '거래 다수결로 단지 확정 지번을 갱신하고, 자격을 잃은 행은 삭제한다. 일배치·백필 뒤에 호출한다. '
  '삭제 판정은 computed_at <> now() — 이 테이블의 유일한 writer 가 이 함수라는 전제에 기댄다.';

-- 🔴 PostgREST 로 부를 수 있게 statement_timeout 을 함수 단위로 넉넉히 준다.
--    기본 8초는 이 집계(운영권역+부산 거래 전수)에 빠듯하다. 고쳐서 빨라졌지만
--    데이터가 늘면 다시 닿을 수 있고, **조용한 null 로 실패하는 것이 가장 나쁘다.**
alter function public.refresh_complex_canonical_jibun() set statement_timeout = '180s';

revoke execute on function public.refresh_complex_canonical_jibun() from public, anon, authenticated;
grant execute on function public.refresh_complex_canonical_jibun() to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'backup_agent') then
    grant execute on function public.refresh_complex_canonical_jibun() to backup_agent;
  end if;
end $$;
