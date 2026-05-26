-- 입주예정 지도 핀: new_listings에 좌표 컬럼 추가
ALTER TABLE public.new_listings
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

CREATE INDEX IF NOT EXISTS new_listings_latlong_idx
  ON public.new_listings(lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;
