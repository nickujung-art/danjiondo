-- Phase 24: 단지별 AI 코멘트 배치 — 입력 데이터 조회 RPC
-- get_complex_commentary_batch_inputs: commentary 생성이 필요한 단지+버킷 조합을 한 번에 조회
-- 배치 스크립트(generate-complex-commentary.ts)에서 100건씩 페이지네이션하여 호출한다
-- STABLE: 읽기 전용 집계 쿼리
-- SECURITY DEFINER 사용 금지: service_role로 호출, 호출자 권한으로 충분

CREATE OR REPLACE FUNCTION public.get_complex_commentary_batch_inputs(
  p_area_bucket text DEFAULT '84',
  p_stale_days  int  DEFAULT 35,
  p_limit       int  DEFAULT 200,
  p_offset      int  DEFAULT 0
)
RETURNS TABLE (
  complex_id          uuid,
  area_bucket         text,
  complex_name        text,
  si                  text,
  gu                  text,
  built_year          int,
  household_count     int,
  near_price          int,
  far_price           int,
  change_pct          numeric,
  avg_mape            real,
  model_name          text,
  training_count      int,
  jeonse_ratio        numeric,
  gap_amount          int,
  gap_risk_level      text,
  price_change_30d    numeric,
  tx_count_30d        int,
  avg_sale_per_pyeong numeric,
  hagwon_score        int,
  management_cost_m2  numeric,
  primary_school_name text,
  students_per_class  numeric
)
LANGUAGE sql STABLE
AS $$
  WITH preds AS (
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
        )
      )                          AS near_price,
      MAX(p.predicted_price_mean) FILTER (
        WHERE p.predicted_month = (
          SELECT MAX(p2.predicted_month)
          FROM public.complex_price_predictions p2
          WHERE p2.complex_id   = p.complex_id
            AND p2.area_bucket  = p.area_bucket
            AND p2.computed_at >= NOW() - INTERVAL '3 days'
        )
      )                          AS far_price,
      AVG(p.training_mape)::real AS avg_mape,
      MAX(p.model_name)          AS model_name,
      MAX(p.training_count)      AS training_count,
      MAX(p.ai_commentary)       AS ai_commentary,
      MAX(p.ai_cached_at)        AS ai_cached_at
    FROM public.complex_price_predictions p
    WHERE p.computed_at >= NOW() - INTERVAL '3 days'
      AND p.area_bucket = p_area_bucket
    GROUP BY p.complex_id, p.area_bucket
  )
  SELECT
    pr.complex_id,
    pr.area_bucket,
    c.canonical_name                                                                        AS complex_name,
    c.si,
    c.gu,
    c.built_year::int,
    c.household_count::int,
    pr.near_price::int,
    pr.far_price::int,
    ROUND(((pr.far_price - pr.near_price)::numeric / NULLIF(pr.near_price, 0)) * 100, 2)  AS change_pct,
    pr.avg_mape,
    pr.model_name,
    pr.training_count::int,
    gs.jeonse_ratio,
    gs.gap_amount::int,
    gs.risk_level                                                                           AS gap_risk_level,
    ROUND((c.price_change_30d * 100)::numeric, 1)                                          AS price_change_30d,
    c.tx_count_30d::int,
    c.avg_sale_per_pyeong::numeric,
    c.hagwon_score::int,
    fk.management_cost_m2::numeric,
    fs.school_name                                                                          AS primary_school_name,
    fs.students_per_class
  FROM preds pr
  JOIN public.complexes c ON c.id = pr.complex_id
  LEFT JOIN public.complex_gap_stats gs
         ON gs.complex_id = pr.complex_id
  LEFT JOIN LATERAL (
    SELECT management_cost_m2
    FROM public.facility_kapt
    WHERE complex_id = pr.complex_id
    ORDER BY data_month DESC NULLS LAST
    LIMIT 1
  ) fk ON true
  LEFT JOIN LATERAL (
    SELECT school_name, students_per_class
    FROM public.facility_school
    WHERE complex_id  = pr.complex_id
      AND school_type = 'elementary'
      AND is_assignment = true
    ORDER BY distance_m ASC NULLS LAST
    LIMIT 1
  ) fs ON true
  WHERE pr.near_price IS NOT NULL
    AND pr.far_price  IS NOT NULL
    AND (pr.ai_commentary IS NULL
         OR pr.ai_cached_at < NOW() - (p_stale_days || ' days')::interval)
  ORDER BY change_pct DESC NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_complex_commentary_batch_inputs(text, int, int, int)
  TO authenticated, anon;
