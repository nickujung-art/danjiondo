-- 창부레터 0단계 0-5: complex_rankings.rank_type 에 'price_change' 추가
-- 근거: changbuletter/docs/adr/ADR-005 §1 (LOCKED), SPEC-002 0-5, 40-CONTEXT D-04
--
-- 왜 CHECK 확장인가: 홈 히어로의 riseRank·avgRise·hotArea 와 volumeRank 의 변동률이
-- 전부 이 rank_type 에 의존한다. 실시간 RPC 집계는 ADR-005 가 기각했다
-- (PostgREST authenticator 의 statement_timeout=8s).
--
-- ⚠️ ACCESS EXCLUSIVE 락: drop → add 순서라 complex_rankings 에 짧은 락이 걸리고
--    add 시 기존 행 전체(2026-07-31 실측 691행)를 검증 스캔한다. 소규모라 실무상 무해하다.
--
-- ⛔ 허용값을 넓히기만 한다. 기존 4종을 제거하지 않으며 UPDATE/DELETE 도 없다.

alter table public.complex_rankings
  drop constraint complex_rankings_rank_type_check;

alter table public.complex_rankings
  add constraint complex_rankings_rank_type_check
  check (rank_type in ('high_price', 'volume', 'price_per_pyeong', 'interest', 'price_change'));
