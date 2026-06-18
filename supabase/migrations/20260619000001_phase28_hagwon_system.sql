-- Phase 28: 학원 추천 시스템
-- hagwon_db + user_child_profiles + recommend_hagwons RPC

-- ── hagwon_db ──────────────────────────────────────────────────────────────
CREATE TABLE public.hagwon_db (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  aca_asnum         text        UNIQUE NOT NULL,     -- 학원지정번호 (NEIS upsert 키)
  name              text        NOT NULL,             -- ACA_NM
  address           text,                             -- FA_RDNMA (도로명주소)
  address_detail    text,                             -- FA_RDNDA
  zipcode           text,                             -- FA_RDNZC
  phone             text,                             -- FA_TELNO
  realm_sc_nm       text,                             -- REALM_SC_NM (분야명)
  le_ord_nm         text,                             -- LE_ORD_NM (교습계열명)
  le_crse_nm        text,                             -- LE_CRSE_NM (교습과정명)
  fee_text          text,                             -- PSNBY_THCC_CNTNT 원본
  fee_amount        integer,                          -- 수강료 정수 (파싱, nullable)
  fee_tier          text        CHECK (fee_tier IN ('premium', 'standard', 'budget')),
  capacity          integer,                          -- TOFOR_SMTOT (정원)
  instructor_count  integer,                          -- NEIS 미제공 → null
  established_at    date,                             -- ESTBL_YMD
  is_active         boolean     NOT NULL DEFAULT true, -- REG_STTUS_NM='등록'
  location          geometry(Point, 4326),             -- Kakao geocoding 결과
  admst_zone_nm     text,                             -- 행정구역명 (창원시 성산구 등)
  age_groups        text[]      DEFAULT '{}',          -- Groq 분류
  subject_category  text        CHECK (subject_category IN ('academic','arts','sports','language')),
  teaching_style    text        CHECK (teaching_style IN ('exam_prep','enrichment','tutoring')),
  naver_blog_count  integer,
  popularity_score  numeric(5,4),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER hagwon_db_updated_at
  BEFORE UPDATE ON public.hagwon_db
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PostGIS GiST 인덱스 (ST_DWithin 성능 — Pitfall 6 방어)
CREATE INDEX idx_hagwon_db_location
  ON public.hagwon_db USING GIST (location);
CREATE INDEX idx_hagwon_db_is_active
  ON public.hagwon_db (is_active) WHERE is_active = true;
CREATE INDEX idx_hagwon_db_age_groups
  ON public.hagwon_db USING GIN (age_groups);

-- ── user_child_profiles ────────────────────────────────────────────────────
CREATE TABLE public.user_child_profiles (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname       text        NOT NULL DEFAULT '자녀',
  age_group      text        NOT NULL CHECK (age_group IN ('유아','유치','초등저','초등고','중등','고등')),
  subject_prefs  text[]      NOT NULL DEFAULT '{}',
  fee_tier_pref  text        CHECK (fee_tier_pref IN ('premium','standard','budget')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_child_profiles_user_id
  ON public.user_child_profiles(user_id);

CREATE TRIGGER user_child_profiles_updated_at
  BEFORE UPDATE ON public.user_child_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.hagwon_db ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_child_profiles ENABLE ROW LEVEL SECURITY;

-- hagwon_db: 공개 읽기, service_role 쓰기
CREATE POLICY "hagwon_db: public read"
  ON public.hagwon_db FOR SELECT USING (true);
CREATE POLICY "hagwon_db: service_role write"
  ON public.hagwon_db FOR ALL
  USING (auth.role() = 'service_role');

-- user_child_profiles: 소유자 전체 권한 (favorites 패턴 동일)
CREATE POLICY "user_child_profiles: owner all"
  ON public.user_child_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── recommend_hagwons RPC ─────────────────────────────────────────────────
-- 거리(40%) + 인기도(30%) + tier 매칭(30%) 가중치 스코어링
CREATE OR REPLACE FUNCTION public.recommend_hagwons(
  p_lat       FLOAT,
  p_lng       FLOAT,
  p_age_group TEXT    DEFAULT NULL,
  p_subjects  TEXT[]  DEFAULT NULL,
  p_fee_tier  TEXT    DEFAULT NULL,
  p_limit     INT     DEFAULT 10
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
          WHEN p_fee_tier IS NULL OR h.fee_tier = p_fee_tier THEN 1.0
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

GRANT EXECUTE ON FUNCTION public.recommend_hagwons
  TO anon, authenticated;
