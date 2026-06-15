-- KOSIS 인구 데이터 Supabase 캐시 테이블
-- 배포 후 KOSIS API 타임아웃으로 "집계중" 고착되는 문제 해결
-- fetchPopulationBySgg()가 이 테이블을 먼저 읽고 없으면 KOSIS API 호출 후 저장
CREATE TABLE IF NOT EXISTS public.region_population_cache (
  sgg_code    text    NOT NULL,
  year        integer NOT NULL,
  sgg_name    text    NOT NULL,
  population  integer NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sgg_code, year)
);

ALTER TABLE public.region_population_cache ENABLE ROW LEVEL SECURITY;

-- anon/authenticated 읽기 허용 (서버사이드에서 anon key로 읽음)
CREATE POLICY "public_read" ON public.region_population_cache
  FOR SELECT TO anon, authenticated USING (true);

-- 쓰기: service_role만 가능 (policy 없음 = 차단)
-- 서버는 SUPABASE_SERVICE_ROLE_KEY로 RLS bypass 후 upsert

COMMENT ON TABLE public.region_population_cache IS
  'KOSIS 시군구 연도별 인구수 캐시. scripts/seed-kosis-population.ts로 초기 적재, 이후 연간 재실행.';
