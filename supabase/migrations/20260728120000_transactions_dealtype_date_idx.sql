-- compute_gap_stats() RPC가 PostgREST authenticator 롤의 statement_timeout(8s)을
-- 초과해 daily-batch cron에서 5일 연속 실패(57014 canceling statement due to statement
-- timeout). EXPLAIN ANALYZE로 확인한 실행시간 6.67초 중 6.5초가 transactions 테이블의
-- Bitmap Heap Scan 단계 — transactions_deal_date_idx가 deal_date 단일 컬럼이라
-- deal_type 필터를 인덱스에서 못 거르고 8~10만 건을 힙에서 리체크하는 게 원인.
--
-- 83만 행 규모의 라이브 프로덕션 테이블(실시간 조회 + 일배치 쓰기)에 추가하는 인덱스라
-- CONCURRENTLY로 빌드해 ACCESS EXCLUSIVE 락 없이 적용한다.
CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_valid_dealtype_date_idx
  ON public.transactions (deal_type, deal_date DESC)
  WHERE cancel_date IS NULL AND superseded_by IS NULL;
