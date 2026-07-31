-- realtrade-story 랭킹 "신고가" 정렬의 네트워크 왕복을 462회 → 1회로 줄이는 RPC.
-- 선행 마이그레이션 20260731000001_transactions_complex_price_idx.sql 의 인덱스가 반드시
-- 먼저 적용돼 있어야 의미가 있다(없으면 462번의 힙 정렬을 DB 안에서 반복할 뿐이다).
--
-- [배경]
-- 인덱스만으로도 단건 쿼리는 35ms → 1ms 미만이 되지만, realtrade-story는 Supabase가
-- 시드니(ap-southeast-2)에 있고 앱 서버는 서울(Vercel icn1)이라 왕복 1회에 약 220ms가
-- 붙는다(실측: 단건 쿼리 총 0.22초 중 DB 처리 35ms). 462회 왕복은 50개씩 병렬로 묶어도
-- 10웨이브 × 220ms ≈ 2.2초의 순수 지연이 남는다.
-- 이 함수는 462개 단지 판정을 Postgres 안에서 끝내고 결과만 한 번에 돌려주므로
-- 왕복이 1회가 된다.
--
-- (realtrade-story 쪽에서는 Vercel 리전을 syd1으로 옮겨 왕복 지연 자체도 줄였다.
--  두 조치는 독립적이며 함께 적용하면 효과가 겹치지 않고 각각 유효하다.)
--
-- [반환 계약]
-- 입력한 complex_id 전부에 대해 한 행씩 반환한다. 이전 거래 이력이 없는 단지는
-- max_price가 NULL로 온다 — 호출부(countPeriodRecords)는 "이전 최고가 없음"을
-- 무조건 신고가로 취급하므로, 행 자체를 생략하지 않고 NULL로 명시해야 그 분기가 유지된다.
create or replace function public.complex_historical_max_before(
  p_complex_ids uuid[],
  p_before_date date
)
returns table (complex_id uuid, max_price bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id as complex_id,
    (
      select t.price
        from public.transactions t
       where t.complex_id = c.id
         and t.deal_type = 'sale'
         and t.cancel_date is null
         and t.superseded_by is null
         and t.deal_date < p_before_date
         and t.price is not null
       order by t.price desc
       limit 1
    ) as max_price
  from unnest(p_complex_ids) as c(id);
$$;

-- anon 롤에서 호출 가능해야 한다 — realtrade-story는 공개 조회에 anon 키만 쓴다(SEC-03,
-- 서비스롤 키를 저장소에 두지 않는다). security invoker + transactions의 기존 RLS 정책을
-- 그대로 따르므로 이 함수가 권한을 우회하지 않는다.
grant execute on function public.complex_historical_max_before(uuid[], date) to anon, authenticated;

-- [적용 후 검증]
--   select * from public.complex_historical_max_before(
--     array(select distinct complex_id from public.transactions
--            where sgg_code in ('48121','48123','48125','48127','48129')
--              and deal_type='sale' and cancel_date is null and superseded_by is null
--              and deal_date >= current_date - 90
--              and complex_id is not null),
--     (current_date - 90)::date
--   );
-- 462행이 돌아오고 전체 실행시간이 1초 미만이면 성공.
