-- Phase 28 v2: subject_category 7개 세분화 + fee_tier_pref 배열화
-- 입시/국어/수학/영어/미술/스포츠/기타외국어

-- 1. hagwon_db.subject_category: 4개 → 7개로 확장 (기존 값 초기화 후 재분류)
ALTER TABLE public.hagwon_db
  DROP CONSTRAINT IF EXISTS hagwon_db_subject_category_check;

UPDATE public.hagwon_db SET subject_category = NULL;

ALTER TABLE public.hagwon_db
  ADD CONSTRAINT hagwon_db_subject_category_check
  CHECK (subject_category IN ('exam_prep','korean','math','english','arts','sports','other_language'));

-- 2. user_child_profiles.fee_tier_pref: text → text[] (복수 선택)
ALTER TABLE public.user_child_profiles
  DROP CONSTRAINT IF EXISTS user_child_profiles_fee_tier_pref_check;
ALTER TABLE public.user_child_profiles
  ALTER COLUMN fee_tier_pref TYPE text[]
    USING CASE
      WHEN fee_tier_pref IS NULL THEN NULL
      ELSE ARRAY[fee_tier_pref]
    END;

-- 3. recommend_hagwons RPC: p_fee_tier TEXT → p_fee_tiers TEXT[]
CREATE OR REPLACE FUNCTION public.recommend_hagwons(
  p_lat        FLOAT,
  p_lng        FLOAT,
  p_age_group  TEXT    DEFAULT NULL,
  p_subjects   TEXT[]  DEFAULT NULL,
  p_fee_tiers  TEXT[]  DEFAULT NULL,
  p_limit      INT     DEFAULT 10
) RETURNS TABLE (
  id               UUID,
  name             TEXT,
  address          TEXT,
  distance_m       FLOAT,
  realm_sc_nm      TEXT,
  le_crse_nm       TEXT,
  fee_tier         TEXT,
  popularity_score NUMERIC,
  age_groups       TEXT[],
  subject_category TEXT,
  score            FLOAT
) LANGUAGE sql STABLE AS $$
  SELECT
    h.id,
    h.name,
    h.address,
    ST_Distance(h.location::geography, ST_Point(p_lng, p_lat)::geography) AS distance_m,
    h.realm_sc_nm,
    h.le_crse_nm,
    h.fee_tier,
    h.popularity_score,
    h.age_groups,
    h.subject_category,
    (
      0.4 * (1.0 - LEAST(
        ST_Distance(h.location::geography, ST_Point(p_lng, p_lat)::geography),
        2000.0
      ) / 2000.0)
      + 0.3 * COALESCE(h.popularity_score::FLOAT, 0.0)
      + 0.3 * CASE
          WHEN p_fee_tiers IS NULL
            OR array_length(p_fee_tiers, 1) = 0
            OR h.fee_tier = ANY(p_fee_tiers) THEN 1.0
          WHEN h.fee_tier IS NULL THEN 0.5
          ELSE 0.3
        END
    ) AS score
  FROM public.hagwon_db h
  WHERE h.is_active = TRUE
    AND h.location IS NOT NULL
    AND ST_DWithin(
      h.location::geography,
      ST_Point(p_lng, p_lat)::geography,
      2000
    )
    AND (p_age_group IS NULL OR h.age_groups @> ARRAY[p_age_group])
    AND (
      p_subjects IS NULL
      OR array_length(p_subjects, 1) = 0
      OR h.subject_category = ANY(p_subjects)
    )
  ORDER BY score DESC
  LIMIT p_limit;
$$;
