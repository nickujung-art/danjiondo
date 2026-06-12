-- get_quadrant_data: 시/구 단지별 평당가·전세가율 조회
-- complexes.avg_sale_per_pyeong + complex_gap_stats.jeonse_ratio 를 직접 조인
-- 기존: transactions 80K 행 JS 집계 (~1.5s) → 현재: precomputed 값 단순 JOIN (<50ms)
CREATE OR REPLACE FUNCTION get_quadrant_data(p_si text, p_gu text)
RETURNS TABLE(
  complex_id    uuid,
  complex_name  text,
  avg_sale_pp   numeric,
  avg_jeonse_pp numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    c.id,
    c.canonical_name,
    c.avg_sale_per_pyeong::numeric,
    (c.avg_sale_per_pyeong * gs.jeonse_ratio / 100)::numeric
  FROM complexes c
  JOIN complex_gap_stats gs ON gs.complex_id = c.id
  WHERE c.si     = p_si
    AND c.gu     = p_gu
    AND c.status = 'active'
    AND c.avg_sale_per_pyeong IS NOT NULL
    AND gs.jeonse_ratio       IS NOT NULL
  LIMIT 400
$$;
