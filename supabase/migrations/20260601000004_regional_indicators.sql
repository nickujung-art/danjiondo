-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 22: 미분양 + 인구 지표 테이블 (데이터는 추후 API 적재)
-- ─────────────────────────────────────────────────────────────────────────────

-- 미분양 현황 (국토부 API로 채워질 예정)
CREATE TABLE IF NOT EXISTS public.regional_unsold (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sgg_code    text NOT NULL,
  year_month  text NOT NULL,  -- 'YYYYMM'
  unsold_count integer NOT NULL DEFAULT 0,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sgg_code, year_month)
);
ALTER TABLE public.regional_unsold ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_regional_unsold" ON public.regional_unsold FOR SELECT USING (true);
GRANT SELECT ON public.regional_unsold TO authenticated, anon;
GRANT ALL ON public.regional_unsold TO service_role;
CREATE INDEX IF NOT EXISTS idx_regional_unsold_sgg_ym ON public.regional_unsold (sgg_code, year_month DESC);

-- 인구 현황 (행안부 API로 채워질 예정)
CREATE TABLE IF NOT EXISTS public.regional_population (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sgg_code    text NOT NULL,
  year_month  text NOT NULL,  -- 'YYYYMM'
  population  integer NOT NULL,
  households  integer,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sgg_code, year_month)
);
ALTER TABLE public.regional_population ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_regional_population" ON public.regional_population FOR SELECT USING (true);
GRANT SELECT ON public.regional_population TO authenticated, anon;
GRANT ALL ON public.regional_population TO service_role;
CREATE INDEX IF NOT EXISTS idx_regional_population_sgg_ym ON public.regional_population (sgg_code, year_month DESC);
