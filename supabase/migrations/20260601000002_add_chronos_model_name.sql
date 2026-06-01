-- model_name CHECK에 chronos-bolt-small 추가
ALTER TABLE public.complex_price_predictions
  DROP CONSTRAINT IF EXISTS complex_price_predictions_model_name_check;

ALTER TABLE public.complex_price_predictions
  ADD CONSTRAINT complex_price_predictions_model_name_check
  CHECK (model_name IN ('holt-winters', 'double-exp', 'linear', 'insufficient-data', 'chronos-bolt-small'));

-- RPC 필터를 3일로 완화 (Chronos daily 실행 커버)
CREATE OR REPLACE FUNCTION public.invest_prediction_ranking(
  p_sgg_code    text DEFAULT NULL,
  p_area_bucket text DEFAULT NULL,
  p_max_mape    real DEFAULT 0.25,
  p_limit       int  DEFAULT 10
)
RETURNS TABLE (
  complex_id    uuid,
  complex_name  text,
  si            text,
  gu            text,
  sgg_code      text,
  area_bucket   text,
  near_price    integer,
  far_price     integer,
  change_pct    numeric,
  avg_mape      real,
  ai_commentary text
)
LANGUAGE sql STABLE
AS $$
  WITH near_far AS (
    SELECT
      p.complex_id,
      p.area_bucket,
      MIN(p.predicted_price_mean) FILTER (
        WHERE p.predicted_month = (
          SELECT MIN(p2.predicted_month) FROM complex_price_predictions p2
          WHERE p2.complex_id = p.complex_id AND p2.area_bucket = p.area_bucket
            AND p2.computed_at >= NOW() - INTERVAL '3 days'
        )
      ) AS near_price,
      MAX(p.predicted_price_mean) FILTER (
        WHERE p.predicted_month = (
          SELECT MAX(p2.predicted_month) FROM complex_price_predictions p2
          WHERE p2.complex_id = p.complex_id AND p2.area_bucket = p.area_bucket
            AND p2.computed_at >= NOW() - INTERVAL '3 days'
        )
      ) AS far_price,
      AVG(p.training_mape)::real AS avg_mape,
      MAX(p.ai_commentary)       AS ai_commentary
    FROM complex_price_predictions p
    WHERE p.computed_at >= NOW() - INTERVAL '3 days'
      AND (p_area_bucket IS NULL OR p.area_bucket = p_area_bucket)
    GROUP BY p.complex_id, p.area_bucket
  )
  SELECT
    nf.complex_id,
    c.canonical_name AS complex_name,
    c.si, c.gu, c.sgg_code,
    nf.area_bucket,
    nf.near_price,
    nf.far_price,
    ROUND(((nf.far_price - nf.near_price)::numeric / NULLIF(nf.near_price, 0)) * 100, 1) AS change_pct,
    nf.avg_mape,
    nf.ai_commentary
  FROM near_far nf
  JOIN complexes c ON c.id = nf.complex_id
  WHERE nf.near_price IS NOT NULL
    AND nf.far_price  IS NOT NULL
    AND nf.avg_mape < p_max_mape
    AND (p_sgg_code IS NULL OR c.sgg_code = p_sgg_code)
  ORDER BY change_pct DESC
  LIMIT p_limit
$$;

CREATE OR REPLACE FUNCTION public.invest_regional_prediction_summary(
  p_area_bucket text DEFAULT NULL
)
RETURNS TABLE (
  sgg_code          text,
  complex_count     bigint,
  median_change_pct numeric,
  avg_near_price    numeric,
  avg_far_price     numeric
)
LANGUAGE sql STABLE
AS $$
  WITH near_far AS (
    SELECT
      p.complex_id,
      c.sgg_code,
      MIN(p.predicted_price_mean) FILTER (
        WHERE p.predicted_month = (
          SELECT MIN(p2.predicted_month) FROM complex_price_predictions p2
          WHERE p2.complex_id = p.complex_id AND p2.area_bucket = p.area_bucket
            AND p2.computed_at >= NOW() - INTERVAL '3 days'
        )
      ) AS near_price,
      MAX(p.predicted_price_mean) FILTER (
        WHERE p.predicted_month = (
          SELECT MAX(p2.predicted_month) FROM complex_price_predictions p2
          WHERE p2.complex_id = p.complex_id AND p2.area_bucket = p.area_bucket
            AND p2.computed_at >= NOW() - INTERVAL '3 days'
        )
      ) AS far_price
    FROM complex_price_predictions p
    JOIN complexes c ON c.id = p.complex_id
    WHERE p.computed_at >= NOW() - INTERVAL '3 days'
      AND (p_area_bucket IS NULL OR p.area_bucket = p_area_bucket)
      AND p.training_mape < 0.25
    GROUP BY p.complex_id, c.sgg_code, p.area_bucket
  ),
  changes AS (
    SELECT sgg_code, complex_id,
      ROUND(((far_price - near_price)::numeric / NULLIF(near_price, 0)) * 100, 1) AS change_pct
    FROM near_far WHERE near_price IS NOT NULL AND far_price IS NOT NULL
  ),
  by_region AS (
    SELECT sgg_code,
      COUNT(DISTINCT complex_id) AS complex_count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY change_pct)::numeric AS median_change_pct
    FROM changes GROUP BY sgg_code
  ),
  avg_prices AS (
    SELECT sgg_code,
      AVG(near_price)::numeric AS avg_near_price,
      AVG(far_price)::numeric  AS avg_far_price
    FROM near_far WHERE near_price IS NOT NULL AND far_price IS NOT NULL
    GROUP BY sgg_code
  )
  SELECT br.sgg_code, br.complex_count,
    ROUND(br.median_change_pct, 1) AS median_change_pct,
    ROUND(ap.avg_near_price)       AS avg_near_price,
    ROUND(ap.avg_far_price)        AS avg_far_price
  FROM by_region br JOIN avg_prices ap USING (sgg_code)
  ORDER BY median_change_pct DESC
$$;
