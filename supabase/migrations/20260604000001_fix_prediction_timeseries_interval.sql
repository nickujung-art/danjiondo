-- Chronos 배치가 며칠 간격으로 실행될 수 있으므로 3일 → 7일로 확장
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
    COUNT(DISTINCT p.complex_id) AS complex_count
  FROM complex_price_predictions p
  JOIN complexes c ON c.id = p.complex_id
  WHERE c.sgg_code = p_sgg_code
    AND p.computed_at >= NOW() - INTERVAL '7 days'
    AND p.training_mape < p_max_mape
    AND (p_area_bucket IS NULL OR p.area_bucket = p_area_bucket)
  GROUP BY p.predicted_month
  ORDER BY p.predicted_month
$$;
GRANT EXECUTE ON FUNCTION public.invest_regional_prediction_timeseries(text, text, real) TO authenticated, anon;
