-- invest_prediction_ranking: p_area_bucket NULL 처리 누락 수정
-- 기존: AND p.area_bucket = p_area_bucket → NULL 전달 시 0건 (SQL NULL 비교 항상 FALSE)
-- 수정: (p_area_bucket IS NULL OR p.area_bucket = p_area_bucket)
-- 영향: 투자 분석 메인 페이지 "예측 상승 기대 단지" 섹션이 비어 있던 문제 해결
DROP FUNCTION IF EXISTS public.invest_prediction_ranking(text, text, real, int);
CREATE OR REPLACE FUNCTION public.invest_prediction_ranking(
  p_sgg_code    text    DEFAULT NULL,
  p_area_bucket text    DEFAULT NULL,
  p_max_mape    real    DEFAULT 0.25,
  p_limit       int     DEFAULT 20
)
RETURNS TABLE (
  complex_id    uuid,
  complex_name  text,
  si            text,
  gu            text,
  sgg_code      text,
  area_bucket   text,
  near_price    numeric,
  far_price     numeric,
  change_pct    numeric,
  avg_mape      real,
  ai_commentary text,
  url_slug      text,
  status        text
)
LANGUAGE sql STABLE
AS $$
  WITH ranked AS (
    SELECT
      p.complex_id,
      p.area_bucket,
      MIN(p.predicted_price_mean) FILTER (
        WHERE p.predicted_month = (
          SELECT MIN(p2.predicted_month)
          FROM public.complex_price_predictions p2
          WHERE p2.complex_id   = p.complex_id
            AND p2.area_bucket  = p.area_bucket
            AND p2.computed_at >= NOW() - INTERVAL '3 days'
            AND p2.predicted_month > CURRENT_DATE
        )
      )                           AS near_price,
      MAX(p.predicted_price_mean) FILTER (
        WHERE p.predicted_month = (
          SELECT MAX(p2.predicted_month)
          FROM public.complex_price_predictions p2
          WHERE p2.complex_id   = p.complex_id
            AND p2.area_bucket  = p.area_bucket
            AND p2.computed_at >= NOW() - INTERVAL '3 days'
            AND p2.predicted_month > CURRENT_DATE
        )
      )                           AS far_price,
      AVG(p.training_mape)::real  AS avg_mape,
      MAX(p.ai_commentary)        AS ai_commentary
    FROM public.complex_price_predictions p
    WHERE p.computed_at >= NOW() - INTERVAL '3 days'
      AND (p_area_bucket IS NULL OR p.area_bucket = p_area_bucket)
      AND (p_sgg_code IS NULL OR EXISTS (
        SELECT 1 FROM public.complexes cx
        WHERE cx.id = p.complex_id AND cx.sgg_code = p_sgg_code
      ))
    GROUP BY p.complex_id, p.area_bucket
    HAVING AVG(p.training_mape) <= p_max_mape
  )
  SELECT
    r.complex_id,
    c.canonical_name  AS complex_name,
    c.si,
    c.gu,
    c.sgg_code,
    r.area_bucket,
    r.near_price,
    r.far_price,
    ROUND(((r.far_price - r.near_price)::numeric / NULLIF(r.near_price, 0)) * 100, 2) AS change_pct,
    r.avg_mape,
    r.ai_commentary,
    c.url_slug,
    c.status::text
  FROM ranked r
  JOIN public.complexes c ON c.id = r.complex_id
  WHERE r.near_price IS NOT NULL
    AND r.far_price  IS NOT NULL
    AND r.far_price  >  r.near_price
  ORDER BY change_pct DESC NULLS LAST
  LIMIT p_limit
$$;
