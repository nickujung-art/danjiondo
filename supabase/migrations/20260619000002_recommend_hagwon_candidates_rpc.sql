-- recommend_hagwon_candidates RPC
-- 코드(hagwon-recommend.ts)가 호출하는 RPC. recommend_hagwons의 확장판.
-- 차이점:
--   - p_home_lat/p_home_lng + 학교 좌표(p_school_lat/p_school_lng) 별도 수신
--   - hagwon_lat, hagwon_lng, dist_home 컬럼 반환 (TS 루트 최적화에 필요)
--   - 학교 2km 반경도 포함하여 후보 풀 확장 (집 OR 학교)
--   - p_subject: TEXT 단수 (과목별로 개별 호출하는 TS 코드에 맞춤)

CREATE OR REPLACE FUNCTION public.recommend_hagwon_candidates(
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
  dist_home        FLOAT
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
    ST_Distance(h.location::geography, ST_Point(p_home_lng, p_home_lat)::geography)  AS dist_home
  FROM public.hagwon_db h
  WHERE h.is_active = TRUE
    AND h.location IS NOT NULL
    AND (
      -- 집 2km 반경
      ST_DWithin(h.location::geography, ST_Point(p_home_lng, p_home_lat)::geography, 2000)
      OR (
        -- 학교 2km 반경 (학교 선택 시 후보 풀 확장)
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
