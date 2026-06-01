-- ─────────────────────────────────────────────────────────────────────────────
-- 74㎡ 면적 버킷 추가 (66~79㎡)
-- 기존 84 버킷을 79㎡ 기준으로 분리: 소형/<50 · 59/50-66 · 74/66-79 · 84/79-95 · 대형/95+
-- 영향: complex_price_predictions CHECK, compute_predictions, invest_price_history,
--        invest_regional_price_history, invest_regional_jeonse_ratio
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. complex_price_predictions CHECK 제약 갱신 ────────────────────────────────
ALTER TABLE public.complex_price_predictions
  DROP CONSTRAINT IF EXISTS complex_price_predictions_area_bucket_check;
ALTER TABLE public.complex_price_predictions
  ADD CONSTRAINT complex_price_predictions_area_bucket_check
  CHECK (area_bucket IN ('소형', '59', '74', '84', '대형'));


-- 2. compute_predictions (배치 스크립트용) ────────────────────────────────────
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
          WHEN area_m2 < 79 THEN '74'
          WHEN area_m2 < 95 THEN '84'
          ELSE '대형'
        END = p_area_bucket
  GROUP BY to_char(deal_date, 'YYYY-MM')
  HAVING COUNT(*) >= 1
  ORDER BY year_month ASC
$$;
GRANT EXECUTE ON FUNCTION public.compute_predictions(uuid, text, int) TO authenticated, anon;


-- 3. invest_price_history (단지 상세 차트용) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.invest_price_history(
  p_complex_id   uuid,
  p_deal_type    public.deal_type  DEFAULT 'sale',
  p_months       int               DEFAULT 24,
  p_area_bucket  text              DEFAULT NULL
)
RETURNS TABLE (year_month text, avg_price numeric, tx_count bigint)
LANGUAGE plpgsql STABLE
AS $$
DECLARE v_months int;
BEGIN
  v_months := GREATEST(1, LEAST(60, p_months));
  RETURN QUERY
  SELECT
    to_char(deal_date, 'YYYY-MM')  AS year_month,
    ROUND(AVG(price))              AS avg_price,
    COUNT(*)                       AS tx_count
  FROM public.transactions
  WHERE
    complex_id    = p_complex_id
    AND deal_type = p_deal_type
    AND deal_date >= (CURRENT_DATE - (v_months || ' months')::interval)::date
    AND cancel_date   IS NULL
    AND superseded_by IS NULL
    AND (
      p_area_bucket IS NULL
      OR CASE
           WHEN area_m2 < 50 THEN '소형'
           WHEN area_m2 < 66 THEN '59'
           WHEN area_m2 < 79 THEN '74'
           WHEN area_m2 < 95 THEN '84'
           ELSE '대형'
         END = p_area_bucket
    )
  GROUP BY to_char(deal_date, 'YYYY-MM')
  ORDER BY year_month ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.invest_price_history(uuid, public.deal_type, int, text) TO authenticated, anon;


-- 4. invest_regional_price_history (지역 시세 이력) ───────────────────────────
CREATE OR REPLACE FUNCTION public.invest_regional_price_history(
  p_sgg_code     text  DEFAULT NULL,
  p_months       int   DEFAULT 24,
  p_area_bucket  text  DEFAULT NULL
)
RETURNS TABLE (year_month text, avg_price numeric, tx_count bigint)
LANGUAGE plpgsql STABLE
AS $$
DECLARE v_months int;
BEGIN
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
           WHEN area_m2 < 79 THEN '74'
           WHEN area_m2 < 95 THEN '84'
           ELSE '대형'
         END = p_area_bucket
    )
  GROUP BY to_char(deal_date, 'YYYY-MM')
  ORDER BY year_month ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.invest_regional_price_history(text, int, text) TO authenticated, anon;


-- 5. invest_regional_jeonse_ratio (전세가율) ──────────────────────────────────
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
    WHERE deal_type = 'rent'::public.deal_type
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
$$;
GRANT EXECUTE ON FUNCTION public.invest_regional_jeonse_ratio(text, text, int) TO authenticated, anon;
