-- 청약홈 미등록 분양 예정 단지 크롤링 데이터 저장
CREATE TABLE public.presale_enriched (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  sgg_code     text,
  address      text,
  source_url   text,
  source_type  text NOT NULL DEFAULT 'crawl',  -- 'crawl' | 'manual'
  crawled_at   timestamptz,

  builder      text,
  contractor   text,
  total_units  integer,
  move_in_date text,

  summary      jsonb DEFAULT '{}'::jsonb,  -- {totalFloors, buildings, parkingPerUnit, ...}
  unit_types   jsonb DEFAULT '[]'::jsonb,  -- [{type, area_m2, units, priceMin, priceMax}, ...]
  community    jsonb DEFAULT '{}'::jsonb,  -- {facilities: [...]}

  sale_status  text NOT NULL DEFAULT 'presale',
  is_active    boolean NOT NULL DEFAULT true,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.presale_enriched ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presale_enriched_public_read" ON public.presale_enriched
  FOR SELECT USING (true);
CREATE POLICY "presale_enriched_service_write" ON public.presale_enriched
  USING (auth.role() = 'service_role');

CREATE INDEX presale_enriched_sgg_code_idx ON public.presale_enriched (sgg_code) WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER presale_enriched_updated_at
  BEFORE UPDATE ON public.presale_enriched
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
