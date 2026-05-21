-- 지역 통계 확장: 인구 변화 + 연령분포 컬럼 추가
ALTER TABLE public.district_stats
  ADD COLUMN IF NOT EXISTS population_change  integer,
  ADD COLUMN IF NOT EXISTS pop_under20        integer,
  ADD COLUMN IF NOT EXISTS pop_20s            integer,
  ADD COLUMN IF NOT EXISTS pop_30s            integer,
  ADD COLUMN IF NOT EXISTS pop_40s            integer,
  ADD COLUMN IF NOT EXISTS pop_50s            integer,
  ADD COLUMN IF NOT EXISTS pop_60plus         integer;
