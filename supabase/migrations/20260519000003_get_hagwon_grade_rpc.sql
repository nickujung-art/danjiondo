-- complexes.hagwon_score는 정수(raw 학원수 가중합), PERCENT_RANK로 전체 분포 백분위 계산 후 등급 반환
CREATE OR REPLACE FUNCTION get_hagwon_grade(p_complex_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ranked AS (
    SELECT
      id,
      PERCENT_RANK() OVER (ORDER BY hagwon_score) AS pct
    FROM complexes
    WHERE hagwon_score IS NOT NULL
  )
  SELECT
    CASE
      WHEN pct >= 0.933 THEN 'A+'
      WHEN pct >= 0.867 THEN 'A'
      WHEN pct >= 0.800 THEN 'A-'
      WHEN pct >= 0.700 THEN 'B+'
      WHEN pct >= 0.600 THEN 'B'
      WHEN pct >= 0.500 THEN 'B-'
      WHEN pct >= 0.400 THEN 'C+'
      WHEN pct >= 0.300 THEN 'C'
      WHEN pct >= 0.200 THEN 'C-'
      ELSE 'D'
    END
  FROM ranked
  WHERE id = p_complex_id
$$;

GRANT EXECUTE ON FUNCTION get_hagwon_grade(uuid) TO anon, authenticated;
