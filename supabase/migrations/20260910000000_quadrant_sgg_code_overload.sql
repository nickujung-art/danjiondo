-- ㊵ get_quadrant_data: sgg_code 오버로드 추가
-- 김해(48250) 단지 576곳이 전부 gu=NULL → 기존 (si,gu) 시그니처는 김해에서 영구 0행
-- sgg_code는 NOT NULL이라 NULL 문제·si NULL 33곳·LIMIT 400 잘림을 한 번에 해결
CREATE OR REPLACE FUNCTION get_quadrant_data(p_sgg_code text)
RETURNS TABLE(
  complex_id    uuid,
  complex_name  text,
  avg_sale_pp   numeric,
  avg_jeonse_pp numeric
) LANGUAGE sql STABLE AS $$
  WITH region_complexes AS (
    SELECT id, canonical_name
    FROM complexes
    WHERE sgg_code = p_sgg_code AND status = 'active'
    ORDER BY id
    LIMIT 1000
  ),
  tx_agg AS (
    SELECT
      t.complex_id,
      AVG(t.price / (t.area_m2 / 3.3058))
        FILTER (WHERE t.deal_type = 'sale')::numeric    AS sale_pp,
      AVG(t.price / (t.area_m2 / 3.3058))
        FILTER (WHERE t.deal_type = 'jeonse')::numeric  AS jeonse_pp
    FROM transactions t
    JOIN region_complexes rc ON rc.id = t.complex_id
    WHERE t.cancel_date   IS NULL
      AND t.superseded_by IS NULL
      AND t.deal_date     >= CURRENT_DATE - INTERVAL '12 months'
      AND t.area_m2       > 0
      AND t.deal_type     IN ('sale', 'jeonse')
    GROUP BY t.complex_id
    HAVING COUNT(*) FILTER (WHERE t.deal_type = 'sale')   >= 2
       AND COUNT(*) FILTER (WHERE t.deal_type = 'jeonse') >= 2
  )
  SELECT c.id, c.canonical_name, tx.sale_pp, tx.jeonse_pp
  FROM region_complexes c
  JOIN tx_agg tx ON tx.complex_id = c.id
$$;
