-- Phase 37 복원 — 원장 version 20260618085906에서 추출, 프로덕션 그대로 재현 (개선 금지: D-03)


-- C-2: regional_income RLS 활성화
ALTER TABLE public.regional_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regional_income: public read"
  ON public.regional_income FOR SELECT USING (true);

-- C-3: complex_area_types RLS 활성화
ALTER TABLE public.complex_area_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "complex_area_types: public read"
  ON public.complex_area_types FOR SELECT USING (true);

-- H-3: ad_events INSERT 정책 — 인증된 사용자만 허용하도록 강화
DROP POLICY IF EXISTS "ad_events: authenticated insert" ON public.ad_events;
CREATE POLICY "ad_events: authenticated insert"
  ON public.ad_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
