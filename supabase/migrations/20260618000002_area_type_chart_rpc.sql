-- complex_transactions_for_chart RPC에 area_type_id + pyeong_name 추가
-- 단지 상세 차트 평형 칩을 "84㎡" → "34A" 형태로 표시하기 위함
-- complex_area_types 테이블과 LEFT JOIN (네이버 미매핑 단지는 NULL → 기존 Math.round 방식 fallback)
-- RETURNS 절이 변경되므로 DROP 후 재생성 필요

DROP FUNCTION IF EXISTS public.complex_transactions_for_chart(uuid, text, integer, numeric);

CREATE OR REPLACE FUNCTION public.complex_transactions_for_chart(
  p_complex_id uuid,
  p_deal_type  text,
  p_months     int     DEFAULT 120,
  p_area_m2    numeric DEFAULT NULL
) RETURNS TABLE (
  deal_date     text,
  year_month    text,
  price         numeric,
  area_m2       numeric,
  area_type_id  uuid,
  pyeong_name   text
) LANGUAGE sql STABLE AS $$
  SELECT
    t.deal_date::text                    AS deal_date,
    TO_CHAR(t.deal_date, 'YYYY-MM')      AS year_month,
    t.price::numeric                     AS price,
    t.area_m2::numeric                   AS area_m2,
    t.area_type_id                       AS area_type_id,
    cat.pyeong_name                      AS pyeong_name
  FROM public.transactions t
  LEFT JOIN public.complex_area_types cat ON cat.id = t.area_type_id
  WHERE
    t.complex_id         = p_complex_id
    AND t.deal_type      = p_deal_type::public.deal_type
    AND t.deal_date      >= (NOW() - (p_months || ' months')::INTERVAL)::DATE
    AND t.cancel_date    IS NULL
    AND t.superseded_by  IS NULL
    AND (p_area_m2 IS NULL OR ROUND(t.area_m2) = ROUND(p_area_m2))
  ORDER BY t.deal_date ASC
$$;

COMMENT ON FUNCTION public.complex_transactions_for_chart IS
  'UX-01/UX-02: 개별 거래 행 반환. area_type_id/pyeong_name 포함 (네이버 평형 기준). 미매핑 단지는 NULL → 클라이언트 Math.round fallback.';
