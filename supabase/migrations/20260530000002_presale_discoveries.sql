-- Phase 23: 분양 예정 단지 검수 워크플로우
-- 뉴스 크롤링으로 감지된 단지를 관리자가 검수하여 new_listings에 등록하는 staging 테이블

CREATE TABLE IF NOT EXISTS public.presale_discoveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,                    -- 감지된 단지명 (뉴스에서 추출)
  region          text NOT NULL,                    -- 지역명
  hssply_adres    text,                             -- 카카오 지오코딩 주소
  lat             double precision,
  lng             double precision,
  source_url      text,                             -- 뉴스 원본 URL
  discovered_at   timestamptz NOT NULL DEFAULT now(),

  -- 건축HUB 매칭 결과
  arch_hub_id     text,                             -- 건축HUB 인허가 PK
  arch_hub_data   jsonb,                            -- 건축HUB 원본 응답 (건물명/주소/세대수/허가일 등)
  arch_hub_matched_at timestamptz,

  -- 관리자 검수
  status          text NOT NULL DEFAULT 'pending'   -- pending | confirmed | rejected
                  CHECK (status IN ('pending','confirmed','rejected')),
  admin_notes     text,
  confirmed_by    uuid REFERENCES auth.users(id),
  confirmed_at    timestamptz,

  -- new_listings 연결 (confirm 시 생성)
  new_listing_id  uuid REFERENCES public.new_listings(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 동일 단지명+지역 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS presale_discoveries_name_region_idx
  ON public.presale_discoveries (name, region);

-- 검수 상태 조회 인덱스
CREATE INDEX IF NOT EXISTS presale_discoveries_status_idx
  ON public.presale_discoveries (status, discovered_at DESC);

-- RLS
ALTER TABLE public.presale_discoveries ENABLE ROW LEVEL SECURITY;

-- 어드민만 전체 접근
CREATE POLICY "admin_all" ON public.presale_discoveries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

-- service_role full access
GRANT ALL ON public.presale_discoveries TO service_role;
