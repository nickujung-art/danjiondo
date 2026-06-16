-- school_quality_percentile_by_si RPC: univ_rate (고등학교 대학 진학률) 지원 추가
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

  ELSIF p_metric = 'univ_rate' THEN
    SELECT
      COUNT(*) FILTER (WHERE fs.univ_rate < p_target_value)::double precision
      / NULLIF(COUNT(*) FILTER (WHERE fs.univ_rate IS NOT NULL), 0)
    INTO result
    FROM public.facility_school fs
    JOIN public.complexes c ON c.id = fs.complex_id
    WHERE c.si = p_si
      AND fs.school_type = 'high'
      AND fs.univ_rate IS NOT NULL;

  ELSE
    RETURN 0.5;
  END IF;

  RETURN COALESCE(result, 0.5);
END;
$$;

GRANT EXECUTE ON FUNCTION public.school_quality_percentile_by_si(text, numeric, text)
  TO authenticated, anon;
