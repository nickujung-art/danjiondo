-- compute_gap_stats 를 PUBLIC 에서 회수 (2026-08-07)
--
-- [왜 별건인가]
-- 바로 앞 마이그레이션(20260807052310)이 refresh_complex_gap_stats 를 만들면서
-- "11초짜리 전체 재계산은 Free 티어에서 DoS 수단이라 PUBLIC 에서 회수한다"고 적어놓고,
-- 정작 **그 안에서 부르는 compute_gap_stats 는 열어둔 채**였다. 래퍼만 잠그고 원본은
-- 옆문으로 열려 있으면 잠근 게 아니다.
--
-- 실측 확인(2026-08-07):
--   proacl = {=X/postgres, postgres=X/postgres, anon=X/postgres,
--             authenticated=X/postgres, service_role=X/postgres}
-- 앞머리 `=X` 가 PUBLIC EXECUTE 다. compute_gap_stats 는 SECURITY INVOKER 이고
-- transactions 의 RLS 는 공개 읽기(USING true)라, anon 키만으로
-- `POST /rest/v1/rpc/compute_gap_stats` 가 그대로 통한다 — 이 마이그레이션이 우회하려던
-- 바로 그 PERCENTILE_CONT 스캔을 아무나 반복 유발할 수 있다.
--
-- anon 롤에 statement_timeout=3s 가 걸려 있어 호출 하나가 3초에 잘리긴 하지만,
-- 잘리기 전까지 I/O 는 그대로 쓴다. 횟수 제한이 아니라 권한으로 막는 게 맞다.
--
-- [영향 없음을 확인함]
-- 이 함수를 부르는 앱 코드는 두 저장소 어디에도 없다(주석과 생성된 타입 정의뿐).
-- 유일한 호출자는 refresh_complex_gap_stats 인데, 그건 SECURITY DEFINER 라
-- 소유자(postgres) 권한으로 실행되므로 이 회수의 영향을 받지 않는다.
--
-- 선례: 20260806070000_revoke_from_public_not_just_anon.sql — anon 만 회수하고 PUBLIC 을
-- 놔둬서 실제로 안 막혔던 전례가 이 저장소에 이미 있다. 그래서 PUBLIC 을 함께 적는다.

REVOKE EXECUTE ON FUNCTION public.compute_gap_stats(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.compute_gap_stats(integer) TO service_role, backup_agent;

COMMENT ON FUNCTION public.compute_gap_stats(integer) IS
  '갭 통계 집계(읽기 전용). cold 11초대라 아무나 부를 수 있으면 DoS 수단이 된다 — '
  'EXECUTE 는 service_role·backup_agent 로 제한. 실제 반영은 refresh_complex_gap_stats 가 한다.';
