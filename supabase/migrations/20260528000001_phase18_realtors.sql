-- Phase 18: 공인중개사 추천 섹션
-- CRITICAL: 모든 신규 테이블은 RLS 필수 (CLAUDE.md)

-- 공인중개사 마스터
CREATE TABLE public.realtors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  agency_name   text NOT NULL,
  phone         text NOT NULL,
  description   text,
  license_no    text,
  image_url     text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- updated_at 자동 갱신 트리거 (기존 set_updated_at() 함수 재사용)
CREATE TRIGGER realtors_updated_at
  BEFORE UPDATE ON public.realtors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 단지-공인중개사 배정 (단지당 순서 1 또는 2 각 1명)
CREATE TABLE public.realtor_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realtor_id     uuid NOT NULL REFERENCES public.realtors(id) ON DELETE CASCADE,
  complex_id     uuid NOT NULL REFERENCES public.complexes(id) ON DELETE CASCADE,
  display_order  smallint NOT NULL DEFAULT 1 CHECK (display_order IN (1, 2)),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(complex_id, display_order)
);

-- 조회 인덱스
CREATE INDEX idx_realtor_assignments_complex_id
  ON public.realtor_assignments(complex_id);
CREATE INDEX idx_realtor_assignments_realtor_id
  ON public.realtor_assignments(realtor_id);

-- RLS 활성화
ALTER TABLE public.realtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtor_assignments ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 정책 (is_active 필터는 앱 레벨에서 처리)
CREATE POLICY "realtors_select_all"
  ON public.realtors FOR SELECT USING (true);

CREATE POLICY "realtor_assignments_select_all"
  ON public.realtor_assignments FOR SELECT USING (true);

-- 어드민 쓰기 정책
-- (Server Actions는 service_role 키를 가진 createSupabaseAdminClient()로 RLS 우회.
--  아래 정책은 이중 방어용으로 유지한다.)
CREATE POLICY "realtors_admin_write"
  ON public.realtors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "realtor_assignments_admin_write"
  ON public.realtor_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );
