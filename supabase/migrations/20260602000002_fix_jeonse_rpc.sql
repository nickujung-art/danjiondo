-- 전세가율 RPC에서 'rent' → 'jeonse' enum 수정
CREATE OR REPLACE FUNCTION public.invest_regional_jeonse_ratio(
  p_sgg_code   text    DEFAULT NULL,
  p_area_bucket text   DEFAULT NULL,
  p_months     integer DEFAULT 24
)
RETURNS TABLE(
  year_month   text,
  sale_avg     numeric,
  rent_avg     numeric,
  jeonse_ratio numeric,
  sale_count   bigint,
  rent_count   bigint
)
LANGUAGE plpgsql STABLE AS $function$
DECLARE v_months int;
BEGIN
  v_months := GREATEST(1, LEAST(60, p_months));
  RETURN QUERY
  WITH monthly_sale AS (
    SELECT to_char(deal_date, 'YYYY-MM') AS ym, ROUND(AVG(price)) AS sale_avg, COUNT(*) AS sale_count
    FROM public.transactions
    WHERE deal_type = 'sale'::public.deal_type
      AND deal_date >= (CURRENT_DATE - (v_months || ' months')::interval)::date
      AND cancel_date IS NULL AND superseded_by IS NULL
      AND (p_sgg_code IS NULL OR sgg_code = p_sgg_code)
      AND (p_area_bucket IS NULL OR CASE
             WHEN area_m2 < 50 THEN '소형'
             WHEN area_m2 < 66 THEN '59'
             WHEN area_m2 < 79 THEN '74'
             WHEN area_m2 < 95 THEN '84'
             ELSE '대형'
           END = p_area_bucket)
    GROUP BY to_char(deal_date, 'YYYY-MM')
  ),
  monthly_rent AS (
    SELECT to_char(deal_date, 'YYYY-MM') AS ym, ROUND(AVG(price)) AS rent_avg, COUNT(*) AS rent_count
    FROM public.transactions
    WHERE deal_type = 'jeonse'::public.deal_type   -- was 'rent' — wrong enum value
      AND deal_date >= (CURRENT_DATE - (v_months || ' months')::interval)::date
      AND cancel_date IS NULL AND superseded_by IS NULL
      AND (p_sgg_code IS NULL OR sgg_code = p_sgg_code)
      AND (p_area_bucket IS NULL OR CASE
             WHEN area_m2 < 50 THEN '소형'
             WHEN area_m2 < 66 THEN '59'
             WHEN area_m2 < 79 THEN '74'
             WHEN area_m2 < 95 THEN '84'
             ELSE '대형'
           END = p_area_bucket)
    GROUP BY to_char(deal_date, 'YYYY-MM')
  )
  SELECT s.ym, s.sale_avg, r.rent_avg,
    CASE WHEN s.sale_avg > 0 AND r.rent_avg IS NOT NULL
         THEN ROUND((r.rent_avg / s.sale_avg) * 100, 1) ELSE NULL END,
    s.sale_count, COALESCE(r.rent_count, 0)
  FROM monthly_sale s LEFT JOIN monthly_rent r ON r.ym = s.ym
  ORDER BY s.ym;
END;
$function$;
