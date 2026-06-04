-- invest_price_history / invest_regional_price_history CASE문에 74 버킷 추가
-- 기존: 소형(<50) → 59(<66) → 84(<95) → 대형  (74 누락 → 66~79㎡ 단지 차트 공백)
-- 수정: 소형(<50) → 59(<66) → 74(<79) → 84(<95) → 대형
-- 영향: 239개 단지에서 74㎡ 탭 선택 시 "데이터가 부족합니다" 표시되던 버그 수정

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
           WHEN area_m2 < 79 THEN '74'
           WHEN area_m2 < 95 THEN '84'
           ELSE '대형'
         END = p_area_bucket
    )
  GROUP BY to_char(deal_date, 'YYYY-MM')
  ORDER BY year_month ASC;
$$;

GRANT EXECUTE ON FUNCTION public.invest_price_history(uuid, text, int, text)
  TO authenticated, anon;

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
           WHEN area_m2 < 79 THEN '74'
           WHEN area_m2 < 95 THEN '84'
           ELSE '대형'
         END = p_area_bucket
    )
  GROUP BY to_char(deal_date, 'YYYY-MM')
  ORDER BY year_month ASC;
$$;

GRANT EXECUTE ON FUNCTION public.invest_regional_price_history(text, int, text)
  TO authenticated, anon;
