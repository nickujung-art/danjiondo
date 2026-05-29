-- Phase 21 fix: p_months 범위 클램핑(1~60) + p_deal_type text → public.deal_type
-- 원본 함수(20260529000001_invest_price_history.sql)를 수정하지 않고 OR REPLACE로 덮어씀

-- ──────────────────────────────────────────────────────────────────────────────
-- 함수 1: invest_price_history (단지별 + 타입별 집계) — 수정본
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invest_price_history(
  p_complex_id   uuid,
  p_deal_type    public.deal_type  DEFAULT 'sale',
  p_months       int               DEFAULT 24,
  p_area_bucket  text              DEFAULT NULL
)
RETURNS TABLE (year_month text, avg_price numeric, tx_count bigint)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_months int;
BEGIN
  -- p_months 를 1~60 사이로 클램핑 (DoS 방지)
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
           WHEN area_m2 < 95 THEN '84'
           ELSE '대형'
         END = p_area_bucket
    )
  GROUP BY to_char(deal_date, 'YYYY-MM')
  ORDER BY year_month ASC;
END;
$$;

-- GRANT는 기존 시그니처가 변경되었으므로 새 시그니처에 다시 부여
GRANT EXECUTE ON FUNCTION public.invest_price_history(uuid, public.deal_type, int, text)
  TO authenticated, anon;

-- ──────────────────────────────────────────────────────────────────────────────
-- 함수 2: invest_regional_price_history (지역 전체 집계) — 수정본
-- ──────────────────────────────────────────────────────────────────────────────
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
  -- p_months 를 1~60 사이로 클램핑 (DoS 방지)
  v_months := GREATEST(1, LEAST(60, p_months));

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
