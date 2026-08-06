-- transactions.created_at 인덱스 (2026-08-06)
--
-- "최근에 적재된 거래"를 세는 쿼리가 seq scan 이라 PostgREST 8초 상한에 걸렸다.
-- 실제로 scripts/check-ingest-linkage.ts 가 HTTP 500(빈 에러 메시지)으로 죽었고,
-- 이번 전수 점검 중 같은 형태의 조사 쿼리도 계속 느렸다.
--
-- 이 인덱스가 받쳐주는 것:
--   * check-ingest-linkage — 적재 직후 단지 연결률 검사(백필·일배치 워크플로의 게이트)
--   * "언제 무엇이 들어왔나" 류의 사후 조사. 2026-05-26 사고를 특정할 때 결정적이었다.
--
-- 운영 DB 에는 CREATE INDEX CONCURRENTLY 로 이미 적용했다(잠금 회피). 여기서는 트랜잭션
-- 안에서 실행될 수 있으므로 CONCURRENTLY 없이 둔다 — 신규 환경에서는 테이블이 작아 빠르다.

CREATE INDEX IF NOT EXISTS transactions_created_at_idx
  ON public.transactions (created_at DESC);
