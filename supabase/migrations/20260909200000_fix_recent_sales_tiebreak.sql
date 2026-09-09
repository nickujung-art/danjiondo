-- ㊳ get_recent_complex_sales: DISTINCT ON 동률 시 비결정적 행 선택 수정
--
-- deal_date 가 같은 거래가 여럿이면 DISTINCT ON 이 임의의 행을 고른다.
-- 상세 페이지는 (deal_date DESC, id ASC) 로 읽으므로 지도 핀과 다른 가격이 표시된다.
-- t.id ASC 를 추가해 두 경로가 같은 거래를 고르게 한다.

CREATE OR REPLACE FUNCTION public.get_recent_complex_sales(
  p_complex_ids uuid[],
  p_since date DEFAULT (CURRENT_DATE - '1 year'::interval)
)
RETURNS TABLE(complex_id uuid, price bigint, deal_date date, area_m2 numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT DISTINCT ON (t.complex_id)
    t.complex_id,
    t.price,
    t.deal_date,
    t.area_m2
  FROM public.transactions t
  WHERE t.complex_id = ANY(p_complex_ids)
    AND t.deal_type   = 'sale'
    AND t.cancel_date IS NULL
    AND t.superseded_by IS NULL
    AND t.deal_date >= p_since
  ORDER BY t.complex_id, t.deal_date DESC, t.id ASC;
$function$;
