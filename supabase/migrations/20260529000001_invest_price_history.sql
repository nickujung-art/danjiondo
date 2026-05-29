-- Phase 21: 투자 분석 통합 페이지
-- invest_price_history: 단지별 타입별 시세 집계 (단지 상세 페이지 차트)
-- invest_regional_price_history: 지역 전체 타입별 시세 집계 (/invest 페이지 차트)
-- 참고: transactions.area_m2 (numeric 6,2) — exclusive_area 컬럼 없음 (20260430000003_transactions.sql 확인)
-- 참고: transactions.sgg_code 컬럼 존재 → 지역 집계 시 complexes JOIN 불필요

-- ──────────────────────────────────────────────────────────────────────────────
-- 함수 1: invest_price_history (단지별 + 타입별 집계)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invest_price_history(
  p_complex_id   uuid,
  p_deal_type    text    DEFAULT 'sale',
  p_months       int     DEFAULT 24,
  p_area_bucket  text    DEFAULT NULL
)
RETURNS TABLE (year_month text, avg_price numeric, tx_count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT
    to_char(deal_date, 'YYYY-MM')  AS year_month,
    ROUND(AVG(price))              AS avg_price,
    COUNT(*)                       AS tx_count
  FROM public.transactions
  WHERE
    complex_id    = p_complex_id
    AND deal_type = p_deal_type::public.deal_type
    AND deal_date >= (CURRENT_DATE - (p_months || ' months')::interval)::date
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
$$;

GRANT EXECUTE ON FUNCTION public.invest_price_history(uuid, text, int, text)
  TO authenticated, anon;

-- ──────────────────────────────────────────────────────────────────────────────
-- 함수 2: invest_regional_price_history (지역 전체 집계)
-- ──────────────────────────────────────────────────────────────────────────────
-- transactions.sgg_code 직접 사용 (complexes JOIN 불필요)
-- p_sgg_code IS NULL 시 전체 지역 집계
CREATE OR REPLACE FUNCTION public.invest_regional_price_history(
  p_sgg_code     text    DEFAULT NULL,
  p_months       int     DEFAULT 24,
  p_area_bucket  text    DEFAULT NULL
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
    deal_type     = 'sale'::public.deal_type
    AND deal_date >= (CURRENT_DATE - (p_months || ' months')::interval)::date
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
$$;

GRANT EXECUTE ON FUNCTION public.invest_regional_price_history(text, int, text)
  TO authenticated, anon;
