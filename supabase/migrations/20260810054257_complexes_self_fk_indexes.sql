-- complexes 자기참조 FK 부분 인덱스 + complex_rankings.complex_id 인덱스 (2026-08-10)
--
-- successor_id / predecessor_id 는 complexes 자기참조 FK 인데 인덱스가 없었다.
-- 단지를 삭제할 때마다 Postgres 가 "이 id 를 참조하는 행이 있나"를 확인하려고
-- complexes 전체(4,421행)를 스캔한다. 부산 단지 1,594건 삭제 = 약 700만 행 검사가 되어
-- statement timeout 이 났다. transactions.superseded_by 와 같은 부류다(20260810053853).
-- 인덱스를 넣자 500건 배치가 즉시 끝났다.
--
-- complex_rankings.complex_id 도 FK 인데 인덱스가 없어 함께 넣는다(773행이라 지금은
-- 비용이 작지만, 랭킹은 계속 쌓이는 테이블이고 단지 삭제 때마다 스캔 대상이 된다).
--
-- [부분 인덱스인 이유] 생성 시점에 successor_id 는 15건, predecessor_id 는 0건만
-- non-NULL 이었다. NULL 을 빼면 인덱스가 사실상 0바이트다.
--
-- **FK 컬럼에는 인덱스를 둔다.** Postgres 는 FK 생성 시 참조받는 쪽만 자동 인덱싱하고
-- 참조하는 쪽은 만들어주지 않는다. 삭제·CASCADE 성능이 여기서 갈린다.
--
-- 참고: 이 DB 에서 complexes 를 참조하는 FK 는 25개다. 그중 인덱스가 없던 것은
-- 위 셋 + new_listings·content_complexes·gps_visits·gps_verification_requests 였다.
-- 뒤 넷은 행수가 작아(184행 이하) 이번에는 넣지 않았다 — 커지면 같이 넣는다.

CREATE INDEX IF NOT EXISTS complexes_successor_id_idx
  ON public.complexes (successor_id) WHERE successor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS complexes_predecessor_id_idx
  ON public.complexes (predecessor_id) WHERE predecessor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS complex_rankings_complex_id_idx
  ON public.complex_rankings (complex_id);
