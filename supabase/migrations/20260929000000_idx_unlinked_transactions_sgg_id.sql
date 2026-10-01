-- link-transactions 스크립트 성능: complex_id IS NULL + sgg_code LIKE + ORDER BY id 커버
-- CONCURRENTLY로 이미 적용 후 repair 처리
CREATE INDEX CONCURRENTLY IF NOT EXISTS transactions_unlinked_sgg_id_idx
ON public.transactions (sgg_code, id)
WHERE complex_id IS NULL AND cancel_date IS NULL AND superseded_by IS NULL;
