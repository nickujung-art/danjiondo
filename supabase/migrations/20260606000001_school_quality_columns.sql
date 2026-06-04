-- Phase 10 학군 고도화: facility_school 품질 컬럼 7개 + 백분위 RPC
ALTER TABLE public.facility_school
  ADD COLUMN IF NOT EXISTS students_per_class  numeric(5,1),   -- 학급당 학생수
  ADD COLUMN IF NOT EXISTS teachers_ratio      numeric(5,1),   -- 교원 1인당 학생수
  ADD COLUMN IF NOT EXISTS advancement_rate    numeric(5,2),   -- 특목고 진학률 % (중학교)
  ADD COLUMN IF NOT EXISTS advancement_science smallint,       -- 과학고 진학자 수
  ADD COLUMN IF NOT EXISTS advancement_foreign smallint,       -- 외고·국제고 진학자 수
  ADD COLUMN IF NOT EXISTS advancement_private smallint,       -- 자사고 진학자 수
  ADD COLUMN IF NOT EXISTS data_year           smallint;       -- 데이터 기준 연도 (예: 2024)

-- 학교 품질 백분위 RPC (창원/김해 시 내 상위%)
CREATE OR REPLACE FUNCTION public.school_quality_percentile_by_si(
  p_metric       text,
  p_target_value numeric,
  p_si           text
)
RETURNS double precision
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result double precision;
BEGIN
  IF p_metric = 'students_per_class' THEN
    SELECT
      COUNT(*) FILTER (WHERE fs.students_per_class > p_target_value)::double precision
      / NULLIF(COUNT(*) FILTER (WHERE fs.students_per_class IS NOT NULL), 0)
    INTO result
    FROM public.facility_school fs
    JOIN public.complexes c ON c.id = fs.complex_id
    WHERE c.si = p_si
      AND fs.students_per_class IS NOT NULL;

  ELSIF p_metric = 'advancement_rate' THEN
    SELECT
      COUNT(*) FILTER (WHERE fs.advancement_rate < p_target_value)::double precision
      / NULLIF(COUNT(*) FILTER (WHERE fs.advancement_rate IS NOT NULL), 0)
    INTO result
    FROM public.facility_school fs
    JOIN public.complexes c ON c.id = fs.complex_id
    WHERE c.si = p_si
      AND fs.school_type = 'middle'
      AND fs.advancement_rate IS NOT NULL;

  ELSE
    RETURN 0.5;
  END IF;

  RETURN COALESCE(result, 0.5);
END;
$$;

GRANT EXECUTE ON FUNCTION public.school_quality_percentile_by_si(text, numeric, text)
  TO authenticated, anon;
