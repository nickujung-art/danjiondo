-- 학교 순위 RPC
-- p_si: '창원시' | '김해시'
-- p_school_type: 'elementary' | 'middle' | 'high'
-- p_metric: 'students_per_class' (낮을수록 rank 1) | 'special' (중학 특목·자사고 합계) | 'univ_rate' (고등 대학진학률 합계)
-- DISTINCT ON school_name 으로 단지별 중복 제거
-- gu: road_address에서 '창원시 XX구' 패턴 추출 (김해시는 null)
CREATE OR REPLACE FUNCTION public.school_ranking(
  p_si          text,
  p_school_type text,
  p_metric      text
)
RETURNS TABLE (
  rank         bigint,
  school_name  text,
  metric_value numeric,
  gu           text
)
LANGUAGE sql
STABLE
AS $$
  WITH deduped AS (
    SELECT DISTINCT ON (fs.school_name)
      fs.school_name,
      fs.road_address,
      CASE
        WHEN p_metric = 'students_per_class' THEN fs.students_per_class
        WHEN p_metric = 'special'            THEN COALESCE(fs.advancement_science,0) + COALESCE(fs.advancement_foreign,0) + COALESCE(fs.advancement_private,0)
        WHEN p_metric = 'univ_rate'          THEN fs.univ_rate
        ELSE NULL
      END AS metric_value
    FROM facility_school fs
    JOIN complexes c ON c.id = fs.complex_id
    WHERE c.si = p_si
      AND fs.school_type = p_school_type
      AND (
        (p_metric = 'students_per_class' AND fs.students_per_class IS NOT NULL)
        OR (p_metric = 'special' AND (fs.advancement_science IS NOT NULL OR fs.advancement_foreign IS NOT NULL OR fs.advancement_private IS NOT NULL))
        OR (p_metric = 'univ_rate' AND fs.univ_rate IS NOT NULL)
      )
    ORDER BY fs.school_name
  ),
  ordered AS (
    SELECT
      school_name,
      road_address,
      metric_value,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN p_metric = 'students_per_class' THEN metric_value END ASC  NULLS LAST,
          CASE WHEN p_metric != 'students_per_class' THEN metric_value END DESC NULLS LAST
      ) AS rank
    FROM deduped
  )
  SELECT
    o.rank,
    o.school_name,
    o.metric_value,
    CASE
      WHEN o.road_address LIKE '%창원시 의창구%'     THEN '의창구'
      WHEN o.road_address LIKE '%창원시 성산구%'     THEN '성산구'
      WHEN o.road_address LIKE '%창원시 마산합포구%' THEN '마산합포구'
      WHEN o.road_address LIKE '%창원시 마산회원구%' THEN '마산회원구'
      WHEN o.road_address LIKE '%창원시 진해구%'     THEN '진해구'
      ELSE NULL
    END AS gu
  FROM ordered o
  ORDER BY o.rank;
$$;

GRANT EXECUTE ON FUNCTION public.school_ranking(text, text, text) TO anon, authenticated;
