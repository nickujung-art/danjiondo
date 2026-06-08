-- 학교 기본정보 컬럼 추가 (학교알리미 apiType=08, apiType=10)
-- establishment_type: 설립구분 (공립/사립/국립)
-- total_students:    총학생수 (명)
-- class_count:       학급수

ALTER TABLE public.facility_school
  ADD COLUMN IF NOT EXISTS establishment_type text,      -- 공립/사립/국립
  ADD COLUMN IF NOT EXISTS total_students     integer,   -- 총학생수
  ADD COLUMN IF NOT EXISTS class_count        integer;   -- 총학급수
