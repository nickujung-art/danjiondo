-- get_recent_complex_sales / get_schools_for_point 이 호출 즉시 실패하던 것을 고친다.
--
-- [증상] 두 함수 모두 `SECURITY DEFINER` + `SET search_path TO ''` 인데 본문이 테이블을
-- 수식 없이 참조한다. search_path 가 비면 `public` 조차 탐색되지 않으므로 호출이 곧바로
-- 죽는다. 정적 분석이 아니라 실제 호출로 확인했다(2026-08-19):
--
--   get_recent_complex_sales → ERROR: relation "transactions" does not exist
--   get_schools_for_point    → ERROR: relation "school_districts" does not exist
--
-- [같은 함정 세 번째] `increment_view_count` 가 RLS 에 막혀 전 단지 view_count=0 이던 일,
-- `get_hagwon_grade` 가 같은 이유로 못 쓰이던 일에 이어 세 번째다. 앞의 둘은 발견돼
-- 고쳐졌지만 이 둘은 남아 있었다.
--
-- [영향]
--  - `get_recent_complex_sales` — `bds/src/lib/data/complexes-map.ts:138` 이 지도 시세 핀에
--    쓴다. 실패를 console.error 로만 남기고 진행해서 **핀에 가격이 빠진 채로도 조용했다.**
--  - `get_schools_for_point` — `bds/scripts/embed-complexes.ts:106` 이 쓴다.
--    `complex_embeddings` 가 지금 0행인데, 이 함수가 못 도는 것과 앞뒤가 맞는다.
--
-- [PostGIS 도 수식해야 한다]
-- 이 프로젝트는 PostGIS 가 `public` 에 설치돼 있다. 따라서 search_path 가 빈 상태에서는
-- **테이블뿐 아니라 `ST_*` 함수도** 찾지 못한다. 테이블만 고치면 다음 줄에서 다시 죽는다.
--
-- [검증] 함수를 바꾸기 전에 수정본 본문을 그대로 쿼리로 실행해 확인했다 —
-- get_schools_for_point 의 수정본은 (128.68, 35.22) 에서 20행을 돌려준다.

CREATE OR REPLACE FUNCTION public.get_recent_complex_sales(
  p_complex_ids uuid[],
  p_since date DEFAULT (CURRENT_DATE - '1 year'::interval)
)
RETURNS TABLE(complex_id uuid, price bigint, deal_date date, area_m2 numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT DISTINCT ON (t.complex_id)
    t.complex_id,
    t.price,
    t.deal_date,
    t.area_m2
  FROM public.transactions t
  WHERE t.complex_id = ANY(p_complex_ids)
    AND t.deal_type   = 'sale'
    AND t.cancel_date IS NULL
    AND t.superseded_by IS NULL
    AND t.deal_date >= p_since
  ORDER BY t.complex_id, t.deal_date DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_schools_for_point(
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE(school_level text, school_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT sds.school_level, sdsch.school_name
  FROM public.school_districts sds
  JOIN public.school_district_schools sdsch ON sdsch.district_id = sds.id
  WHERE public.ST_Within(
          public.ST_SetSRID(public.ST_MakePoint(p_lng, p_lat), 4326),
          sds.geometry
        )
  ORDER BY sds.school_level, sdsch.school_name;
$function$;
