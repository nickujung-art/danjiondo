-- get_quadrant_data: 시/구 단지별 평당가·전세가율 서버사이드 집계
-- 기존: JS에서 80K 행 다운로드 후 계산 (~2s)
-- 현재: DB 단일 스캔 + complexes_si_gu_status_idx 인덱스 활용 (~30ms)
CREATE OR REPLACE FUNCTION get_quadrant_data(p_si text, p_gu text)
RETURNS TABLE(
  complex_id    uuid,
  complex_name  text,
  avg_sale_pp   numeric,
  avg_jeonse_pp numeric
) LANGUAGE sql STABLE AS $$
  WITH region_complexes AS (
    SELECT id, canonical_name
    FROM complexes
    WHERE si = p_si AND gu = p_gu AND status = 'active'
    LIMIT 400
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

-- complexes (si, gu) partial 인덱스 — get_quadrant_data seq scan 제거
CREATE INDEX IF NOT EXISTS complexes_si_gu_status_idx
  ON complexes (si, gu, status)
  WHERE status = 'active';

-- invest_price_history plpgsql overload 제거 (deal_type enum 타입 — PostgREST ambiguous 충돌)
DROP FUNCTION IF EXISTS public.invest_price_history(uuid, deal_type, integer, text);
