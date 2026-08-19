-- check_gps_proximity 가 호출 즉시 실패하던 것을 고친다.
--
-- [증상] 실제 호출로 확인했다(2026-08-19):
--   ERROR: type "geography" does not exist
--     LINE: ST_Point(p_lng, p_lat)::geography
--
-- [왜 정적 검사로 못 잡았나 — 이게 이 건의 핵심이다]
-- 어제 고친 두 함수(get_recent_complex_sales / get_schools_for_point)는 **테이블 참조**가
-- 미수식이라 `FROM`·`JOIN` 줄을 훑으면 잡혔다. 이 함수는 다르다 — 테이블은 이미
-- `public.complexes` 로 잘 수식돼 있고, 깨진 것은
--   (1) `ST_DWithin` / `ST_Point`  ← PostGIS **함수**
--   (2) `::geography`              ← PostGIS **타입**
-- 이다. `search_path` 가 비면 함수와 타입도 못 찾는데, 소스를 줄 단위로 훑는 검사는
-- 여기에 반응하지 않는다. **읽기 전용 함수를 실제로 호출해보고서야 나왔다.**
-- (이 저장소가 반복해 배운 것과 같다: 정적 판정이 조용히 통과하면 그건 안전의 증거가 아니다)
--
-- [언제부터] `20260618093403_fix_security_definer_search_path_v2.sql` 이 이 함수에
-- `SET search_path = ''` 를 건 2026-06-18 부터다. **두 달 넘게 깨져 있었다.**
--
-- [영향] `bds/src/lib/auth/review-actions.ts:84` 의 주민후기 GPS 인증.
-- **fail-closed 라 사고는 나지 않았다** — RPC 가 죽으면 `proximity` 가 null 이고
-- `verified = proximity === true` 가 false 가 되어 인증만 안 될 뿐 잘못 인증되진 않는다.
-- 다만 **그동안 GPS 인증은 한 번도 성공할 수 없었다.**
-- 같은 파일의 주석이 이 상황을 정확히 예언해뒀다:
--   "실패해도 verified=false 로 안전하게 닫히지만(fail-closed), 그러면 '위치 검증 실패'와
--    '검증 기능 고장'이 화면에서 똑같아 보인다. 로그에는 남겨야 한다."
-- 로그에는 실제로 남고 있었다(`console.error`). 아무도 안 읽었을 뿐이다.
--
-- [검증] 함수를 바꾸기 전에 수정본 본문을 그대로 쿼리로 돌렸다 — 단지 자기 좌표로는
-- true, 서울시청 좌표(대조군)로는 false. `complexes.location` 은 `geography(Point,4326)`
-- 이므로 `ST_DWithin` 의 거리 인자는 미터가 맞다.

CREATE OR REPLACE FUNCTION public.check_gps_proximity(
  p_complex_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_distance_m integer DEFAULT 100
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.complexes
    WHERE id = p_complex_id
      AND location IS NOT NULL
      AND public.ST_DWithin(
        location,
        public.ST_Point(p_lng, p_lat)::public.geography,
        p_distance_m
      )
  )
$function$;
