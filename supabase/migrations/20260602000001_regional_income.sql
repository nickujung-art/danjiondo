-- 지역별 연간 가구소득 테이블 (PIR·JHAI 계산용)
-- KOSIS 가계동향조사 기반, 수동 관리 (연 1회 업데이트)
CREATE TABLE IF NOT EXISTS regional_income (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  region_code text NOT NULL,
  year        integer NOT NULL,
  avg_income  integer NOT NULL,       -- 연간 평균 가구소득 (만원)
  source      text NOT NULL DEFAULT 'kosis',
  created_at  timestamptz DEFAULT now(),
  UNIQUE(region_code, year)
);

-- 경남 연간 평균 가구소득 초기값 (KOSIS 가계동향조사)
INSERT INTO regional_income (region_code, year, avg_income, source) VALUES
  ('gyeongnam', 2020, 4820, 'kosis-manual'),
  ('gyeongnam', 2021, 5010, 'kosis-manual'),
  ('gyeongnam', 2022, 5150, 'kosis-manual'),
  ('gyeongnam', 2023, 5280, 'kosis-manual'),
  ('gyeongnam', 2024, 5400, 'kosis-manual')
ON CONFLICT (region_code, year) DO NOTHING;
