-- Phase 13: new_listings 청약홈 API 컬럼 확장 (PRESALE-01, PRESALE-02)
-- 기존 MOLIT 분양권전매 행은 청약홈 신규 컬럼이 NULL로 공존 (무손실 확장).
-- pblanc_no는 NULL 제외 partial unique index → MOLIT 행(pblanc_no=NULL)과 공존.

ALTER TABLE public.new_listings
  ADD COLUMN IF NOT EXISTS pblanc_no            text,
  ADD COLUMN IF NOT EXISTS pblanc_nm            text,
  ADD COLUMN IF NOT EXISTS sgg_code             text,
  ADD COLUMN IF NOT EXISTS supply_region        text,
  ADD COLUMN IF NOT EXISTS supply_count         integer,
  ADD COLUMN IF NOT EXISTS rcept_bgnde          date,
  ADD COLUMN IF NOT EXISTS rcept_endde          date,
  ADD COLUMN IF NOT EXISTS przwner_presnatn_de  date,
  ADD COLUMN IF NOT EXISTS mvn_prearnge_ym      text,
  ADD COLUMN IF NOT EXISTS hssply_adres         text,
  ADD COLUMN IF NOT EXISTS competition_rate     numeric,
  ADD COLUMN IF NOT EXISTS is_active            boolean NOT NULL DEFAULT true;

-- 청약홈 공고번호 partial unique index (NULL 제외 → MOLIT 기존 행과 공존)
CREATE UNIQUE INDEX IF NOT EXISTS new_listings_pblanc_no_idx
  ON public.new_listings(pblanc_no)
  WHERE pblanc_no IS NOT NULL;

-- 마감 공고 자동 비활성화 cron 보조 인덱스
CREATE INDEX IF NOT EXISTS new_listings_active_idx
  ON public.new_listings(is_active, rcept_endde)
  WHERE pblanc_no IS NOT NULL;
