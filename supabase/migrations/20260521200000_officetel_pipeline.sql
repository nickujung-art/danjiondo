-- 오피스텔 파이프라인: building_type 컬럼 + data_source 등록

-- ① complexes 테이블에 building_type 추가
ALTER TABLE public.complexes
  ADD COLUMN IF NOT EXISTS building_type text NOT NULL DEFAULT 'apt'
  CONSTRAINT complexes_building_type_check
    CHECK (building_type IN ('apt', 'officetel', 'mixed'));

CREATE INDEX IF NOT EXISTS complexes_building_type_idx
  ON public.complexes (building_type);

-- ② data_sources에 오피스텔 소스 등록
INSERT INTO public.data_sources (id, cadence, expected_freshness_hours, ui_label)
VALUES
  ('molit_offi_trade', 'monthly', 720, '국토부 오피스텔 실거래가 (매매)'),
  ('molit_offi_rent',  'monthly', 720, '국토부 오피스텔 실거래가 (전월세)')
ON CONFLICT (id) DO NOTHING;
