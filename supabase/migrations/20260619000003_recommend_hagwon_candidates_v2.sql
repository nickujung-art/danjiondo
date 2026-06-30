-- recommend_hagwon_candidates v2: blog_tags·blog_snippet·naver_blog_count 추가
-- HagwonCard에서 강점 태그·리뷰 한마디 렌더링에 사용

DROP FUNCTION IF EXISTS public.recommend_hagwon_candidates(FLOAT, FLOAT, FLOAT, FLOAT, TEXT, TEXT, INT);

CREATE FUNCTION public.recommend_hagwon_candidates(
  p_home_lat   FLOAT,
  p_home_lng   FLOAT,
  p_school_lat FLOAT  DEFAULT NULL,
  p_school_lng FLOAT  DEFAULT NULL,
  p_age_group  TEXT   DEFAULT NULL,
  p_subject    TEXT   DEFAULT NULL,
  p_limit      INT    DEFAULT 20
) RETURNS TABLE (
  id               UUID,
  name             TEXT,
  address          TEXT,
  hagwon_lat       FLOAT,
  hagwon_lng       FLOAT,
  realm_sc_nm      TEXT,
  le_crse_nm       TEXT,
  fee_tier         TEXT,
  popularity_score NUMERIC,
  age_groups       TEXT[],
  subject_category TEXT,
  dist_home        FLOAT,
  blog_tags        TEXT[],
  blog_snippet     TEXT,
  naver_blog_count INTEGER
) LANGUAGE sql STABLE AS $$
  SELECT
    h.id,
    h.name,
    h.address,
    ST_Y(h.location::geometry)                                                       AS hagwon_lat,
    ST_X(h.location::geometry)                                                       AS hagwon_lng,
    h.realm_sc_nm,
    h.le_crse_nm,
    h.fee_tier,
    h.popularity_score,
    h.age_groups,
    h.subject_category,
    ST_Distance(h.location::geography, ST_Point(p_home_lng, p_home_lat)::geography)  AS dist_home,
    COALESCE(h.blog_tags, ARRAY[]::TEXT[])                                           AS blog_tags,
    h.blog_snippet,
    COALESCE(h.naver_blog_count, 0)                                                  AS naver_blog_count
  FROM public.hagwon_db h
  WHERE h.is_active = TRUE
    AND h.location IS NOT NULL
    AND (
      ST_DWithin(h.location::geography, ST_Point(p_home_lng, p_home_lat)::geography, 2000)
      OR (
        p_school_lat IS NOT NULL
        AND p_school_lng IS NOT NULL
        AND ST_DWithin(h.location::geography, ST_Point(p_school_lng, p_school_lat)::geography, 2000)
      )
    )
    AND (p_age_group IS NULL OR h.age_groups @> ARRAY[p_age_group])
    AND (p_subject IS NULL OR h.subject_category = p_subject)
  ORDER BY dist_home ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.recommend_hagwon_candidates(FLOAT, FLOAT, FLOAT, FLOAT, TEXT, TEXT, INT)
  TO anon, authenticated;
