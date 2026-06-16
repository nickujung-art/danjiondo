-- 학교 확장 기본정보 컬럼 추가
-- phone/homepage_url/road_address: 학교알리미 학교목록 API에서 수집
-- teacher_count/founded_date/afterschool_count/special_class_count/meal_type: 공시항목 스크레이핑
ALTER TABLE public.facility_school
  ADD COLUMN IF NOT EXISTS phone               text,       -- 대표전화
  ADD COLUMN IF NOT EXISTS homepage_url        text,       -- 학교 홈페이지
  ADD COLUMN IF NOT EXISTS road_address        text,       -- 도로명주소
  ADD COLUMN IF NOT EXISTS teacher_count       smallint,   -- 교사수
  ADD COLUMN IF NOT EXISTS founded_date        text,       -- 설립일 (YYYY.M)
  ADD COLUMN IF NOT EXISTS afterschool_count   smallint,   -- 방과후 프로그램 수
  ADD COLUMN IF NOT EXISTS special_class_count smallint,   -- 특수학급 수
  ADD COLUMN IF NOT EXISTS meal_type           text;       -- 급식 운영방식 (직영/위탁)
