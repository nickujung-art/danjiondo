-- avg_sale_per_pyeong 수식 버그 수정
-- 기존: (avg(price / pyeong) / 10000)::integer → 4153 / 10000 = 0 (integer 버그)
-- 수정: avg(price / pyeong)::integer             → 4153 (만원/평 단위)

CREATE OR REPLACE FUNCTION public.refresh_complex_price_stats()
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.complexes c
  SET
    avg_sale_per_pyeong = (
      SELECT avg(t.price / NULLIF(t.area_m2 / 3.3058, 0))::integer
      FROM public.transactions t
      WHERE t.complex_id = c.id
        AND t.deal_type = 'sale'
        AND t.deal_date >= CURRENT_DATE - INTERVAL '1 year'
        AND t.cancel_date IS NULL
        AND t.superseded_by IS NULL
        AND t.area_m2 > 0
    ),
    price_change_30d = (
      WITH recent AS (
        SELECT avg(t.price) AS avg_p
        FROM public.transactions t
        WHERE t.complex_id = c.id
          AND t.deal_type = 'sale'
          AND t.deal_date >= CURRENT_DATE - INTERVAL '30 days'
          AND t.cancel_date IS NULL
          AND t.superseded_by IS NULL
      ),
      prev AS (
        SELECT avg(t.price) AS avg_p
        FROM public.transactions t
        WHERE t.complex_id = c.id
          AND t.deal_type = 'sale'
          AND t.deal_date >= CURRENT_DATE - INTERVAL '60 days'
          AND t.deal_date <  CURRENT_DATE - INTERVAL '30 days'
          AND t.cancel_date IS NULL
          AND t.superseded_by IS NULL
      )
      SELECT CASE
        WHEN prev.avg_p IS NULL OR prev.avg_p = 0 THEN NULL
        ELSE round(((recent.avg_p - prev.avg_p) / prev.avg_p)::numeric, 4)
      END
      FROM recent, prev
    ),
    tx_count_30d = (
      SELECT count(*)::integer
      FROM public.transactions t
      WHERE t.complex_id = c.id
        AND t.deal_type = 'sale'
        AND t.deal_date >= CURRENT_DATE - INTERVAL '30 days'
        AND t.cancel_date IS NULL
        AND t.superseded_by IS NULL
    ),
    is_new_record_30d = (
      WITH recent_max AS (
        SELECT max(t.price / NULLIF(t.area_m2, 0)) AS max_unit_price
        FROM public.transactions t
        WHERE t.complex_id = c.id
          AND t.deal_type = 'sale'
          AND t.deal_date >= CURRENT_DATE - INTERVAL '30 days'
          AND t.cancel_date IS NULL
          AND t.superseded_by IS NULL
          AND t.area_m2 > 0
      ),
      hist_max AS (
        SELECT max(t.price / NULLIF(t.area_m2, 0)) AS max_unit_price
        FROM public.transactions t
        WHERE t.complex_id = c.id
          AND t.deal_type = 'sale'
          AND t.deal_date < CURRENT_DATE - INTERVAL '30 days'
          AND t.cancel_date IS NULL
          AND t.superseded_by IS NULL
          AND t.area_m2 > 0
      )
      SELECT CASE
        WHEN recent_max.max_unit_price IS NULL THEN false
        WHEN hist_max.max_unit_price  IS NULL THEN false
        WHEN recent_max.max_unit_price > hist_max.max_unit_price * 1.03 THEN true
        ELSE false
      END
      FROM recent_max, hist_max
    ),
    updated_at = now()
  WHERE c.status = 'active';
$$;
