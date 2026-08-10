-- transactions.superseded_by 부분 인덱스 (2026-08-10)
--
-- [왜 필요한가] superseded_by 는 transactions 자기참조 FK 인데 인덱스가 없었다.
-- 그래서 행을 삭제할 때마다 Postgres 가 참조 검사를 위해
--   SELECT 1 FROM ONLY transactions x WHERE $1 = superseded_by FOR KEY SHARE OF x
-- 를 돌리는데, 인덱스가 없으니 삭제 1건마다 전체 스캔이다.
-- 부산 거래 28만건 삭제가 statement timeout 으로 죽으면서 이 CONTEXT 가 드러났다.
-- 인덱스를 넣자 6만건 배치가 즉시 끝났다.
--
-- **FK 컬럼에는 인덱스를 둔다** — 참조 무결성 검사와 CASCADE 가 그 인덱스를 쓴다.
-- Postgres 는 FK 를 만들 때 참조받는 쪽만 자동 인덱싱하고, 참조하는 쪽은 만들어주지 않는다.
--
-- [부분 인덱스인 이유] 생성 시점에 superseded_by 는 838,222행 전부 NULL 이었다.
-- NULL 을 빼면 인덱스가 사실상 0바이트다. 용량을 줄이려는 작업 중에 인덱스를 늘릴 이유가 없다.
-- FK 검사는 특정 id 값을 찾는 것이라 NULL 제외가 정상 동작에 영향을 주지 않는다.

CREATE INDEX IF NOT EXISTS transactions_superseded_by_idx
  ON public.transactions (superseded_by)
  WHERE superseded_by IS NOT NULL;
