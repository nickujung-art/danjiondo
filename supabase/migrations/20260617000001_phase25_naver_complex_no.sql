-- Phase 25: complexes.naver_complex_no 컬럼 추가
-- 네이버 부동산 단지 ID(예: "19672") 매핑용 — map-naver-complexes.ts 스크립트가 채운다.
-- NULL = 아직 매핑 안 됨. IS NOT NULL = 크롤링 대상.

ALTER TABLE public.complexes
  ADD COLUMN IF NOT EXISTS naver_complex_no TEXT;

-- 동일 naver_complex_no가 두 단지에 매핑되는 걸 방지 (부분 유니크: null 제외)
CREATE UNIQUE INDEX IF NOT EXISTS complexes_naver_complex_no_unique_idx
  ON public.complexes (naver_complex_no)
  WHERE naver_complex_no IS NOT NULL;

-- listing_prices: service_role 클라이언트는 RLS를 우회하므로 크롤링 스크립트용 정책 추가 불필요.
-- (src/lib/supabase/admin.ts의 createClient(url, SERVICE_ROLE_KEY) 패턴으로 RLS bypass)
-- 기존 "listing_prices: public read" + "listing_prices: admin write" 정책은 유지됨.
-- 이 주석은 나중에 읽는 개발자를 위한 의도 문서화.
COMMENT ON COLUMN public.complexes.naver_complex_no IS
  '네이버 부동산 단지 코드(hscpNo). scripts/map-naver-complexes.ts로 매핑. NULL=미매핑.';
