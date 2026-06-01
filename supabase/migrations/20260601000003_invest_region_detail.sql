-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 22: 지역 상세 페이지용 RPC 4종
--   A. compute_predictions           수정 — p_months DEFAULT NULL (전체 데이터)
--   B. invest_regional_price_history 수정 — clamp 60 → 120
--   C. invest_regional_prediction_timeseries 신규
--   D. invest_regional_jeonse_ratio  신규
-- ─────────────────────────────────────────────────────────────────────────────

-- A. compute_predictions — p_months DEFAULT NULL = 전체 데이터 ──────────────────
CREATE OR REPLACE FUNCTION public.compute_predictions(
  p_complex_id  uuid,
  p_area_bucket text,
  p_months      int DEFAULT NULL
)
RETURNS TABLE (year_month text, avg_price numeric, tx_count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT
    to_char(deal_date, 'YYYY-MM') AS year_month,
    ROUND(AVG(price))             AS avg_price,
    COUNT(*)                      AS tx_count
  FROM public.transactions
  WHERE
    complex_id    = p_complex_id
    AND deal_type = 'sale'::public.deal_type
    AND (p_months IS NULL OR deal_date >= (CURRENT_DATE - (p_months || ' months')::interval)::date)
    AND cancel_date   IS NULL
    AND superseded_by IS NULL
    AND CASE
          WHEN area_m2 < 50 THEN '소형'
          WHEN area_m2 < 66 THEN '59'
          WHEN area_m2 < 95 THEN '84'
          ELSE '대형'
        END = p_area_bucket
  GROUP BY to_char(deal_date, 'YYYY-MM')
  HAVING COUNT(*) >= 1
  ORDER BY year_month ASC
$$;
GRANT EXECUTE ON FUNCTION public.compute_predictions(uuid, text, int) TO authenticated, anon;


-- B. invest_regional_price_history — clamp 60 → 120 ───────────────────────────
CREATE OR REPLACE FUNCTION public.invest_regional_price_history(
  p_sgg_code     text  DEFAULT NULL,
  p_months       int   DEFAULT 24,
  p_area_bucket  text  DEFAULT NULL
)
RETURNS TABLE (year_month text, avg_price numeric, tx_count bigint)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_months int;
BEGIN
  -- p_months 를 1~120 사이로 클램핑
  v_months := GREATEST(1, LEAST(120, p_months));

  RETURN QUERY
  SELECT
    to_char(deal_date, 'YYYY-MM') AS year_month,
    ROUND(AVG(price))             AS avg_price,
    COUNT(*)                      AS tx_count
  FROM public.transactions
  WHERE
    deal_type     = 'sale'::public.deal_type
    AND deal_date >= (CURRENT_DATE - (v_months || ' months')::interval)::date
    AND cancel_date   IS NULL
    AND superseded_by IS NULL
    AND (p_sgg_code IS NULL OR sgg_code = p_sgg_code)
    AND (
      p_area_bucket IS NULL
      OR CASE
           WHEN area_m2 < 50 THEN '소형'
           WHEN area_m2 < 66 THEN '59'
           WHEN area_m2 < 95 THEN '84'
           ELSE '대형'
         END = p_area_bucket
    )
  GROUP BY to_char(deal_date, 'YYYY-MM')
  ORDER BY year_month ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invest_regional_price_history(text, int, text)
  TO authenticated, anon;


-- C. invest_regional_prediction_timeseries — 지역별 예측 시계열 ─────────────────
CREATE OR REPLACE FUNCTION public.invest_regional_prediction_timeseries(
  p_sgg_code    text,
  p_area_bucket text DEFAULT NULL,
  p_max_mape    real DEFAULT 0.25
)
RETURNS TABLE (
  predicted_month text,
  median_price    numeric,
  lower_price     numeric,
  upper_price     numeric,
  complex_count   bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    to_char(p.predicted_month, 'YYYY-MM') AS predicted_month,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.predicted_price_mean)::numeric)  AS median_price,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.predicted_price_lower)::numeric) AS lower_price,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.predicted_price_upper)::numeric) AS upper_price,
    COUNT(*) AS complex_count
  FROM complex_price_predictions p
  JOIN complexes c ON c.id = p.complex_id
  WHERE c.sgg_code = p_sgg_code
    AND p.computed_at >= NOW() - INTERVAL '3 days'
    AND p.training_mape < p_max_mape
    AND (p_area_bucket IS NULL OR p.area_bucket = p_area_bucket)
  GROUP BY p.predicted_month
  ORDER BY p.predicted_month
$$;
GRANT EXECUTE ON FUNCTION public.invest_regional_prediction_timeseries(text, text, real) TO authenticated, anon;


-- D. invest_regional_jeonse_ratio — 전세가율 트렌드 ───────────────────────────
CREATE OR REPLACE FUNCTION public.invest_regional_jeonse_ratio(
  p_sgg_code    text DEFAULT NULL,
  p_area_bucket text DEFAULT NULL,
  p_months      int  DEFAULT 24
)
RETURNS TABLE (
  year_month   text,
  sale_avg     numeric,
  rent_avg     numeric,
  jeonse_ratio numeric,
  sale_count   bigint,
  rent_count   bigint
)
LANGUAGE plpgsql STABLE
AS $$
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
      AND (p_area_bucket IS NULL OR CASE WHEN area_m2 < 50 THEN '소형' WHEN area_m2 < 66 THEN '59' WHEN area_m2 < 95 THEN '84' ELSE '대형' END = p_area_bucket)
    GROUP BY to_char(deal_date, 'YYYY-MM')
  ),
  monthly_rent AS (
    SELECT to_char(deal_date, 'YYYY-MM') AS ym, ROUND(AVG(price)) AS rent_avg, COUNT(*) AS rent_count
    FROM public.transactions
    WHERE deal_type = 'rent'::public.deal_type
      AND deal_date >= (CURRENT_DATE - (v_months || ' months')::interval)::date
      AND cancel_date IS NULL AND superseded_by IS NULL
      AND (p_sgg_code IS NULL OR sgg_code = p_sgg_code)
      AND (p_area_bucket IS NULL OR CASE WHEN area_m2 < 50 THEN '소형' WHEN area_m2 < 66 THEN '59' WHEN area_m2 < 95 THEN '84' ELSE '대형' END = p_area_bucket)
    GROUP BY to_char(deal_date, 'YYYY-MM')
  )
  SELECT s.ym, s.sale_avg, r.rent_avg,
    CASE WHEN s.sale_avg > 0 AND r.rent_avg IS NOT NULL THEN ROUND((r.rent_avg / s.sale_avg) * 100, 1) ELSE NULL END,
    s.sale_count, COALESCE(r.rent_count, 0)
  FROM monthly_sale s LEFT JOIN monthly_rent r ON r.ym = s.ym
  ORDER BY s.ym;
END;
$$;
GRANT EXECUTE ON FUNCTION public.invest_regional_jeonse_ratio(text, text, int) TO authenticated, anon;
