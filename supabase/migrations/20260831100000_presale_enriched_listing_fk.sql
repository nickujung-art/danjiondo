-- presale_enriched ↔ new_listings FK 연결.
-- 기존의 이름 완전일치 조인(e.name = l.pblanc_nm)을 FK 기반으로 대체한다.
-- 기존 1행(한신더휴)은 new_listing_id = NULL 로 남는다 (청약홈 미등록 단지).

ALTER TABLE public.presale_enriched
  ADD COLUMN IF NOT EXISTS new_listing_id uuid
    REFERENCES public.new_listings(id) ON DELETE SET NULL;

-- 같은 listing에 enriched 행이 둘 생기는 것을 막는다.
-- 부분 인덱스 → PostgREST upsert 불가. 쓰기는 select→insert/update 패턴 필수.
CREATE UNIQUE INDEX IF NOT EXISTS presale_enriched_new_listing_id_idx
  ON public.presale_enriched (new_listing_id)
  WHERE new_listing_id IS NOT NULL;
