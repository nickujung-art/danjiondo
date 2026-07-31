-- realtrade-story 랭킹 탭 "신고가" 정렬이 5.6초(최악 케이스: 기간 3개월 + 지역 전체)까지
-- 걸리는 문제를 해결한다. 원인은 realtrade-story 저장소에서 실측으로 규명됐다.
--
-- [문제 구조]
-- 신고가 정렬은 "기간 내 거래가 그 단지의 이전 최고가를 넘었는가"를 단지마다 판정해야 한다.
-- 후보 단지가 462개(창원 5구/3개월 기준)이고, 단지당 아래 형태의 단건 쿼리를 날린다:
--     select price from transactions
--      where complex_id = $1 and deal_type = 'sale'
--        and cancel_date is null and superseded_by is null
--        and deal_date < $2 and price is not null
--      order by price desc limit 1
--
-- 기존 transactions_valid_complex_date_idx는 (complex_id, deal_date DESC)라 정렬키가
-- deal_date다. 위 쿼리는 price로 정렬하므로 인덱스가 정렬을 못 해주고, 해당 단지의
-- 이전 이력 전체를 힙에서 읽어 top-N heapsort로 정렬한다.
-- EXPLAIN ANALYZE 실측(이력이 가장 많은 단지 bf276057-…): Bitmap Heap Scan 4,746행 →
-- Sort(price DESC) → Limit 1, 실행시간 35.6ms. 이게 462회 반복된다.
--
-- [기각한 대안 — 전부 실측 후 더 느림이 확인됨]
--   병렬 웨이브 50개 → 5.3초 (현재, 최선)
--   병렬 웨이브 150개 → 8.1초 (동시성 포화로 악화)
--   complex_id를 .in()으로 묶어 한 번에 받아 앱에서 max 계산 → 8.8초 (82,067행 전송)
--   단일 GROUP BY 쿼리 → 14.2초 (EXPLAIN ANALYZE 실측. deal_type+deal_date 인덱스로
--                                 267,170행을 스캔하게 되어 오히려 최악)
-- 즉 애플리케이션 코드로는 더 줄일 수 없고, 인덱스가 근본 해결책이다.
--
-- [이 인덱스가 하는 일]
-- (complex_id, price DESC)로 정렬키를 price에 맞춰, 단지별 상위 1건을 정렬 없이 인덱스
-- 순서대로 즉시 찾게 한다. deal_date를 INCLUDE에 넣어 `deal_date < $2` 판정까지
-- 인덱스에서 끝내 힙 접근을 없앤다(index-only scan).
--
-- 83만 행 규모의 라이브 프로덕션 테이블(실시간 조회 + 일배치 쓰기)에 추가하는 인덱스라
-- CONCURRENTLY로 빌드해 ACCESS EXCLUSIVE 락 없이 적용한다
-- (선례: 20260728120000_transactions_dealtype_date_idx.sql).
CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_valid_complex_price_idx
  ON public.transactions (complex_id, price DESC)
  INCLUDE (deal_date)
  WHERE cancel_date IS NULL AND superseded_by IS NULL AND deal_type = 'sale' AND price IS NOT NULL;

-- [적용 후 검증 방법]
-- 아래 쿼리의 EXPLAIN ANALYZE가 "Bitmap Heap Scan + Sort"에서
-- "Index Only Scan using transactions_valid_complex_price_idx"로 바뀌고
-- 실행시간이 35ms → 1ms 미만으로 떨어지는지 확인한다:
--
--   explain (analyze, buffers)
--   select price from public.transactions
--    where complex_id = 'bf276057-f139-4537-a171-ebc2d4d2bdca'
--      and deal_type = 'sale' and cancel_date is null and superseded_by is null
--      and deal_date < current_date - 90 and price is not null
--    order by price desc limit 1;
