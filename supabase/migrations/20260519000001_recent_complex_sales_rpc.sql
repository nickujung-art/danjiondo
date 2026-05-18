CREATE OR REPLACE FUNCTION get_recent_complex_sales(
  p_complex_ids uuid[],
  p_since       date DEFAULT (CURRENT_DATE - INTERVAL '12 months')
)
RETURNS TABLE (
  complex_id uuid,
  price      bigint,
  deal_date  date,
  area_m2    numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT ON (t.complex_id)
    t.complex_id,
    t.price,
    t.deal_date,
    t.area_m2
  FROM transactions t
  WHERE t.complex_id = ANY(p_complex_ids)
    AND t.deal_type   = 'sale'
    AND t.cancel_date IS NULL
    AND t.superseded_by IS NULL
    AND t.deal_date >= p_since
  ORDER BY t.complex_id, t.deal_date DESC;
$$;

GRANT EXECUTE ON FUNCTION get_recent_complex_sales(uuid[], date) TO anon, authenticated;
