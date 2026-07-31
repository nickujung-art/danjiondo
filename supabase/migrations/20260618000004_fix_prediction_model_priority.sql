-- ─────────────────────────────────────────────────────────────────────────────
-- 예측 모델 우선순위 버그 수정
--
-- 근본 원인:
--   complex_price_predictions에 동일 단지·평형에 대해 여러 모델(chronos-bolt-small,
--   double-exp, linear, holt-winters) 데이터가 혼재.
--   invest_prediction_ranking / invest_regional_prediction_summary의
--   MIN()/MAX() 집계가 모델을 구분하지 않아 near/far가 서로 다른 모델에서
--   추출되어 비현실적 변화율(+465%, 음수 가격 등) 발생.
--
-- 수정:
--   1. 음수 predicted_price_mean 행 삭제 (double-exp 46건, linear 4건)
--   2. 모델 우선순위 CTE 추가:
--      chronos-bolt-small > holt-winters > double-exp > linear
--      단지별로 단일 모델만 사용 → near/far 혼재 차단
--   3. predicted_price_mean > 0 가드 추가 (이중 안전장치)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. 음수 예측가 정리 ────────────────────────────────────────────────────────
DELETE FROM public.complex_price_predictions
WHERE predicted_price_mean <= 0;

-- ── 2. invest_prediction_ranking (모델 우선순위 추가) ─────────────────────────
DROP FUNCTION IF EXISTS public.invest_prediction_ranking(text, text, real, int);
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
  ai_commentary text,
  url_slug      text,
  status        text
)
LANGUAGE sql STABLE
AS $$
  -- 단지·평형별로 우선 모델 1개만 선택
  WITH preferred_model AS (
    SELECT
      complex_id,
      area_bucket,
      CASE
        WHEN bool_or(model_name = 'chronos-bolt-small') THEN 'chronos-bolt-small'
        WHEN bool_or(model_name = 'holt-winters')        THEN 'holt-winters'
        WHEN bool_or(model_name = 'double-exp')          THEN 'double-exp'
        ELSE MIN(model_name) FILTER (WHERE model_name <> 'insufficient-data')
      END AS selected_model
    FROM public.complex_price_predictions
    WHERE computed_at         >= NOW() - INTERVAL '7 days'
      AND predicted_month      > DATE_TRUNC('month', CURRENT_DATE)
      AND predicted_price_mean > 0
      AND training_mape        > 0
      AND training_mape        < p_max_mape
    GROUP BY complex_id, area_bucket
  ),
  -- 선택된 모델의 행만 남김
  filtered_p AS (
    SELECT p.*
    FROM public.complex_price_predictions p
    JOIN preferred_model pm USING (complex_id, area_bucket)
    WHERE p.model_name         = pm.selected_model
      AND p.computed_at       >= NOW() - INTERVAL '7 days'
      AND p.predicted_month    > DATE_TRUNC('month', CURRENT_DATE)
      AND p.predicted_price_mean > 0
      AND p.training_mape      > 0
      AND p.training_mape      < p_max_mape
      AND (p_area_bucket IS NULL OR p.area_bucket = p_area_bucket)
  ),
  near_far AS (
    SELECT
      p.complex_id,
      p.area_bucket,
      MIN(p.predicted_price_mean) FILTER (
        WHERE p.predicted_month = (
          SELECT MIN(p2.predicted_month) FROM filtered_p p2
          WHERE p2.complex_id = p.complex_id AND p2.area_bucket = p.area_bucket
        )
      ) AS near_price,
      MAX(p.predicted_price_mean) FILTER (
        WHERE p.predicted_month = (
          SELECT MAX(p2.predicted_month) FROM filtered_p p2
          WHERE p2.complex_id = p.complex_id AND p2.area_bucket = p.area_bucket
        )
      ) AS far_price,
      AVG(p.training_mape)::real AS avg_mape,
      MAX(p.ai_commentary)       AS ai_commentary
    FROM filtered_p p
    GROUP BY p.complex_id, p.area_bucket
  )
  SELECT
    nf.complex_id,
    c.canonical_name  AS complex_name,
    c.si,
    c.gu,
    c.sgg_code,
    nf.area_bucket,
    nf.near_price::integer,
    nf.far_price::integer,
    ROUND(((nf.far_price - nf.near_price)::numeric / NULLIF(nf.near_price, 0)) * 100, 1) AS change_pct,
    nf.avg_mape,
    nf.ai_commentary,
    c.url_slug,
    c.status::text
  FROM near_far nf
  JOIN public.complexes c ON c.id = nf.complex_id
  WHERE nf.near_price IS NOT NULL
    AND nf.far_price  IS NOT NULL
    AND nf.near_price  > 0
    AND nf.far_price   > 0
    AND (p_sgg_code IS NULL OR c.sgg_code = p_sgg_code)
  ORDER BY change_pct DESC NULLS LAST
  LIMIT p_limit
$$;

GRANT EXECUTE ON FUNCTION public.invest_prediction_ranking(text, text, real, int)
  TO authenticated, anon;


-- ── 3. invest_regional_prediction_summary (모델 우선순위 추가) ────────────────
DROP FUNCTION IF EXISTS public.invest_regional_prediction_summary(text);
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
  WITH preferred_model AS (
    SELECT
      complex_id,
      area_bucket,
      CASE
        WHEN bool_or(model_name = 'chronos-bolt-small') THEN 'chronos-bolt-small'
        WHEN bool_or(model_name = 'holt-winters')        THEN 'holt-winters'
        WHEN bool_or(model_name = 'double-exp')          THEN 'double-exp'
        ELSE MIN(model_name) FILTER (WHERE model_name <> 'insufficient-data')
      END AS selected_model
    FROM public.complex_price_predictions
    WHERE computed_at         >= NOW() - INTERVAL '7 days'
      AND predicted_month      > DATE_TRUNC('month', CURRENT_DATE)
      AND predicted_price_mean > 0
      AND training_mape        > 0
      AND training_mape        < 0.25
    GROUP BY complex_id, area_bucket
  ),
  filtered_p AS (
    SELECT p.*
    FROM public.complex_price_predictions p
    JOIN preferred_model pm USING (complex_id, area_bucket)
    WHERE p.model_name         = pm.selected_model
      AND p.computed_at       >= NOW() - INTERVAL '7 days'
      AND p.predicted_month    > DATE_TRUNC('month', CURRENT_DATE)
      AND p.predicted_price_mean > 0
      AND p.training_mape      > 0
      AND p.training_mape      < 0.25
      AND (p_area_bucket IS NULL OR p.area_bucket = p_area_bucket)
  ),
  near_far AS (
    SELECT
      p.complex_id,
      c.sgg_code,
      p.area_bucket,
      MIN(p.predicted_price_mean) FILTER (
        WHERE p.predicted_month = (
          SELECT MIN(p2.predicted_month) FROM filtered_p p2
          WHERE p2.complex_id = p.complex_id AND p2.area_bucket = p.area_bucket
        )
      ) AS near_price,
      MAX(p.predicted_price_mean) FILTER (
        WHERE p.predicted_month = (
          SELECT MAX(p2.predicted_month) FROM filtered_p p2
          WHERE p2.complex_id = p.complex_id AND p2.area_bucket = p.area_bucket
        )
      ) AS far_price
    FROM filtered_p p
    JOIN public.complexes c ON c.id = p.complex_id
    GROUP BY p.complex_id, c.sgg_code, p.area_bucket
  ),
  changes AS (
    SELECT
      sgg_code, complex_id,
      ROUND(((far_price - near_price)::numeric / NULLIF(near_price, 0)) * 100, 1) AS change_pct
    FROM near_far
    WHERE near_price IS NOT NULL AND far_price IS NOT NULL
      AND near_price > 0 AND far_price > 0
  ),
  by_region AS (
    SELECT
      sgg_code,
      COUNT(DISTINCT complex_id)                                       AS complex_count,
      (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY change_pct))::numeric AS median_change_pct
    FROM changes
    GROUP BY sgg_code
  ),
  avg_prices AS (
    SELECT sgg_code, AVG(near_price) AS avg_near_price, AVG(far_price) AS avg_far_price
    FROM near_far
    WHERE near_price IS NOT NULL AND far_price IS NOT NULL
      AND near_price > 0 AND far_price > 0
    GROUP BY sgg_code
  )
  SELECT
    br.sgg_code,
    br.complex_count,
    ROUND(br.median_change_pct, 1) AS median_change_pct,
    ROUND(ap.avg_near_price)       AS avg_near_price,
    ROUND(ap.avg_far_price)        AS avg_far_price
  FROM by_region br
  JOIN avg_prices ap USING (sgg_code)
  ORDER BY median_change_pct DESC
$$;

GRANT EXECUTE ON FUNCTION public.invest_regional_prediction_summary(text)
  TO authenticated, anon;
