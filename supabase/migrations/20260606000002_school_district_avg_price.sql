-- P2: 배정학교 학군 내 단지 평균 평당가 vs 시 전체 평균 비교 RPC
CREATE OR REPLACE FUNCTION public.school_district_avg_price(
  p_school_name text,
  p_months      int DEFAULT 12
)
RETURNS TABLE (
  school_name     text,
  district_avg_py numeric,
  si_avg_py       numeric,
  complex_count   bigint,
  si              text
)
LANGUAGE sql STABLE
AS $$
  WITH school_complexes AS (
    SELECT DISTINCT fs.complex_id, c.si
    FROM public.facility_school fs
    JOIN public.complexes c ON c.id = fs.complex_id
    WHERE fs.school_name = p_school_name
      AND fs.is_assignment = true
  ),
  district_prices AS (
    SELECT
      sc.si,
      ROUND(AVG(t.price / NULLIF(t.area_m2, 0) * 3.3058)::numeric, 0) AS avg_py,
      COUNT(DISTINCT t.complex_id) AS cnt
    FROM public.transactions t
    JOIN school_complexes sc ON sc.complex_id = t.complex_id
    WHERE t.deal_type = 'sale'
      AND t.deal_date >= (CURRENT_DATE - (p_months || ' months')::interval)::date
      AND t.cancel_date   IS NULL
      AND t.superseded_by IS NULL
    GROUP BY sc.si
  ),
  si_prices AS (
    SELECT
      c.si,
      ROUND(AVG(t.price / NULLIF(t.area_m2, 0) * 3.3058)::numeric, 0) AS avg_py
    FROM public.transactions t
    JOIN public.complexes c ON c.id = t.complex_id
    WHERE t.deal_type = 'sale'
      AND t.deal_date >= (CURRENT_DATE - (p_months || ' months')::interval)::date
      AND t.cancel_date   IS NULL
      AND t.superseded_by IS NULL
      AND c.si IN (SELECT DISTINCT si FROM school_complexes)
    GROUP BY c.si
  )
  SELECT
    p_school_name   AS school_name,
    dp.avg_py       AS district_avg_py,
    sp.avg_py       AS si_avg_py,
    dp.cnt          AS complex_count,
    dp.si           AS si
  FROM district_prices dp
  JOIN si_prices sp ON sp.si = dp.si
  WHERE dp.cnt >= 3;
$$;

GRANT EXECUTE ON FUNCTION public.school_district_avg_price(text, int)
  TO authenticated, anon;
