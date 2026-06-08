-- 진학률 세부 항목 (항목 13-다 졸업생진로현황, 중학교 전용)
ALTER TABLE public.facility_school
  ADD COLUMN IF NOT EXISTS advancement_science  real,  -- 과학고 진학률 %
  ADD COLUMN IF NOT EXISTS advancement_foreign  real,  -- 외고·국제고 진학률 %
  ADD COLUMN IF NOT EXISTS advancement_private  real;  -- 자율형사립고(자사고) 진학률 %
