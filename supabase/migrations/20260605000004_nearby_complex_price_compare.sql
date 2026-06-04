-- 주변 단지 시세 비교 RPC (단지 상세 페이지 비교 카드)
-- 반경 2km 내 단지들의 최근 6개월 평균 평당가 반환
CREATE OR REPLACE FUNCTION public.nearby_complex_price_compare(
  p_complex_id uuid,
  p_radius_m   numeric DEFAULT 2000,
  p_months     int     DEFAULT 6,
  p_limit      int     DEFAULT 4
)
RETURNS TABLE (
  complex_id        uuid,
  complex_name      text,
  distance_m        numeric,
  avg_price_per_py  numeric,
  tx_count          bigint,
  built_year        int
)
LANGUAGE sql STABLE
AS $$
  WITH target AS (
    SELECT lat, lng
    FROM public.complexes
    WHERE id = p_complex_id
      AND lat IS NOT NULL AND lng IS NOT NULL
  ),
  nearby AS (
    SELECT
      c.id,
      c.canonical_name,
      ST_Distance(
        ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326)::geography
      ) AS dist_m,
      c.built_year
    FROM public.complexes c, target t
    WHERE c.id <> p_complex_id
      AND c.lat IS NOT NULL AND c.lng IS NOT NULL
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326)::geography,
        p_radius_m
      )
  ),
  prices AS (
    SELECT
      t.complex_id,
      ROUND(AVG(t.price / NULLIF(t.area_m2, 0) * 3.3058)::numeric, 0) AS avg_price_per_py,
      COUNT(*) AS tx_count
    FROM public.transactions t
    WHERE t.deal_type = 'sale'
      AND t.deal_date >= (CURRENT_DATE - (p_months || ' months')::interval)::date
      AND t.cancel_date   IS NULL
      AND t.superseded_by IS NULL
    GROUP BY t.complex_id
    HAVING COUNT(*) >= 3
  )
  SELECT
    n.id             AS complex_id,
    n.canonical_name AS complex_name,
    ROUND(n.dist_m::numeric, 0) AS distance_m,
    p.avg_price_per_py,
    p.tx_count,
    n.built_year
  FROM nearby n
  JOIN prices p ON p.complex_id = n.id
  ORDER BY n.dist_m ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.nearby_complex_price_compare(uuid, numeric, int, int)
  TO authenticated, anon;
