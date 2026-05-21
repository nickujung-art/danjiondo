-- pblanc_no partial unique index → 진짜 UNIQUE 제약조건으로 교체
-- PostgreSQL UNIQUE는 NULL을 중복으로 취급하지 않으므로
-- pblanc_no=NULL인 기존 MOLIT 행과 안전하게 공존 가능.
-- Supabase upsert의 onConflict: 'pblanc_no' 가 작동하려면 real constraint 필요.

DROP INDEX IF EXISTS public.new_listings_pblanc_no_idx;

ALTER TABLE public.new_listings
  ADD CONSTRAINT new_listings_pblanc_no_key UNIQUE (pblanc_no);
