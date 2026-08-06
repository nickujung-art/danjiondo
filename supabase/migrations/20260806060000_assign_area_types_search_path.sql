-- assign_area_types 에 search_path 고정 (2026-08-06)
--
-- [범위 판단]
-- Supabase security advisor 가 function_search_path_mutable 을 31건 지적했지만, 전수
-- 확인 결과 그중 **SECURITY DEFINER 는 이 함수 하나뿐**이다. 나머지는 전부 SECURITY
-- INVOKER 라 호출자 권한으로 실행되므로 search_path 조작으로 권한이 올라가지 않는다
-- (대부분은 PostGIS·pg_trgm 확장 함수라 애초에 손댈 대상도 아니다).
-- 31건을 일괄로 고치는 것은 위험하다 — 미수식 참조가 있는 함수에 search_path='' 를
-- 걸면 조용히 깨진다. get_hagwon_grade 가 정확히 그 상태로 4주를 갔다(20260806030000).
--
-- [이 함수의 위험]
-- SECURITY DEFINER 인데 search_path 가 고정돼 있지 않고, 본문이 transactions 와
-- complex_area_types 를 **미수식 참조**한다. 호출자가 search_path 를 조작하면 소유자
-- (postgres) 권한으로 엉뚱한 스키마의 동명 테이블을 건드리게 만들 수 있다.
-- 이 함수는 transactions 를 UPDATE 하므로 영향이 작지 않다.
--
-- EXECUTE 권한은 20260806020000 에서 이미 anon·authenticated 로부터 회수했다
-- (인자 없는 전체 배치라 Free 티어에서 DoS 수단이기도 했다).
--
-- [수정] search_path='' 를 걸고 본문의 모든 테이블을 public. 으로 수식한다.
-- 둘 중 하나만 하면 함수가 죽는다 — 반드시 함께.

CREATE OR REPLACE FUNCTION public.assign_area_types()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH ranked AS (
    SELECT
      t.id AS tx_id,
      cat.id AS cat_id,
      ABS(cat.exclusive_area_m2 - t.area_m2) AS dist,
      ROW_NUMBER() OVER (
        PARTITION BY t.id
        ORDER BY ABS(cat.exclusive_area_m2 - t.area_m2), cat.naver_pyeong_no NULLS LAST, cat.id
      ) AS rn
    FROM public.transactions t
    JOIN public.complex_area_types cat ON cat.complex_id = t.complex_id
    WHERE t.area_type_id IS NULL
      AND t.cancel_date IS NULL
      AND t.superseded_by IS NULL
      AND ABS(cat.exclusive_area_m2 - t.area_m2) <= 2.0
  ),
  first_choice  AS (SELECT tx_id, cat_id, dist FROM ranked WHERE rn = 1),
  second_choice AS (SELECT tx_id, dist        FROM ranked WHERE rn = 2)
  UPDATE public.transactions t
  SET area_type_id = f.cat_id
  FROM first_choice f
  LEFT JOIN second_choice s ON s.tx_id = f.tx_id
  WHERE f.tx_id = t.id
    AND (s.dist IS NULL OR (s.dist - f.dist) >= 0.3);
$function$;
