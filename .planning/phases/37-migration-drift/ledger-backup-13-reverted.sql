-- Phase 37 DRIFT-03 원장 백업 — supabase_migrations.schema_migrations에서 제거한 13건의 SQL 원문
--
-- 목적: 이력 보존용. **스키마 재현용이 아니다 — 이 파일을 마이그레이션으로 적용하지 말 것.**
-- 12건은 대응하는 로컬 마이그레이션 파일에 사본이 있고,
-- `20260618075929`(phase28_route_rpc)만 이 백업이 유일한 사본이다.
--
-- 생성: Phase 37 Wave 1, Task 3(`migration repair --status reverted`) 실행 직전
-- 원본: supabase_migrations.schema_migrations.statements[1] (13건 전부 array_length = 1)
-- 프로젝트: auoravdadyzvuoxunogh
--
-- 복구 방법: 원장 행을 되살리려면 `npx supabase migration repair --status applied <version>`.
-- 단 repair는 행만 복구하고 statements 원문은 복원하지 않는다 — 원문은 이 파일이 유일한 기록이다.

-- ============================================================
-- version: 20260618051341
-- name:    phase28_hagwon_system
-- 대응 로컬 파일: supabase/migrations/20260619000001_phase28_hagwon_system.sql
-- ============================================================
-- Phase 28: 학원 추천 시스템
-- hagwon_db + user_child_profiles + recommend_hagwons RPC

-- ── hagwon_db ──────────────────────────────────────────────────────────────
CREATE TABLE public.hagwon_db (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  aca_asnum         text        UNIQUE NOT NULL,
  name              text        NOT NULL,
  address           text,
  address_detail    text,
  zipcode           text,
  phone             text,
  realm_sc_nm       text,
  le_ord_nm         text,
  le_crse_nm        text,
  fee_text          text,
  fee_amount        integer,
  fee_tier          text        CHECK (fee_tier IN ('premium', 'standard', 'budget')),
  capacity          integer,
  instructor_count  integer,
  established_at    date,
  is_active         boolean     NOT NULL DEFAULT true,
  location          geometry(Point, 4326),
  admst_zone_nm     text,
  age_groups        text[]      DEFAULT '{}',
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

CREATE POLICY "hagwon_db: public read"
  ON public.hagwon_db FOR SELECT USING (true);
CREATE POLICY "hagwon_db: service_role write"
  ON public.hagwon_db FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "user_child_profiles: owner all"
  ON public.user_child_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── recommend_hagwons RPC ─────────────────────────────────────────────────
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

-- ============================================================
-- version: 20260618073750
-- name:    phase28_subject_v2
-- 대응 로컬 파일: supabase/migrations/20260619000002_phase28_subject_v2.sql
-- ============================================================

-- Phase 28 v2: subject_category 7개 세분화 + fee_tier_pref 배열화

-- 1. 기존 constraint 제거 → 값 초기화 → 새 constraint 추가 (순서 중요)
ALTER TABLE public.hagwon_db
  DROP CONSTRAINT IF EXISTS hagwon_db_subject_category_check;

UPDATE public.hagwon_db SET subject_category = NULL;

ALTER TABLE public.hagwon_db
  ADD CONSTRAINT hagwon_db_subject_category_check
  CHECK (subject_category IN ('exam_prep','korean','math','english','arts','sports','other_language'));

-- 2. user_child_profiles.fee_tier_pref: text → text[]
ALTER TABLE public.user_child_profiles
  DROP CONSTRAINT IF EXISTS user_child_profiles_fee_tier_pref_check;
ALTER TABLE public.user_child_profiles
  ALTER COLUMN fee_tier_pref TYPE text[]
    USING CASE
      WHEN fee_tier_pref IS NULL THEN NULL
      ELSE ARRAY[fee_tier_pref]
    END;

-- 3. recommend_hagwons RPC: p_fee_tier → p_fee_tiers TEXT[]
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


-- ============================================================
-- version: 20260618075929
-- name:    phase28_route_rpc
-- 대응 로컬 파일: 로컬 사본 없음 — 이 백업이 유일한 사본
-- ============================================================

-- Phase 28 v3: 경로 최적화용 RPC — 학원 좌표 반환 + 타원형 검색
CREATE OR REPLACE FUNCTION public.recommend_hagwon_candidates(
  p_home_lat   FLOAT,
  p_home_lng   FLOAT,
  p_school_lat FLOAT   DEFAULT NULL,
  p_school_lng FLOAT   DEFAULT NULL,
  p_age_group  TEXT    DEFAULT NULL,
  p_subject    TEXT    DEFAULT NULL,
  p_limit      INT     DEFAULT 20
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
  WITH params AS (
    SELECT
      CASE
        WHEN p_school_lat IS NOT NULL
        THEN (p_home_lng + p_school_lng) / 2.0
        ELSE p_home_lng
      END AS center_lng,
      CASE
        WHEN p_school_lat IS NOT NULL
        THEN (p_home_lat + p_school_lat) / 2.0
        ELSE p_home_lat
      END AS center_lat,
      CASE
        WHEN p_school_lat IS NOT NULL
        THEN GREATEST(
          ST_Distance(
            ST_Point(p_home_lng, p_home_lat)::geography,
            ST_Point(p_school_lng, p_school_lat)::geography
          ) * 0.85,
          1200
        )
        ELSE 2000
      END AS radius_m
  )
  SELECT
    h.id,
    h.name,
    h.address,
    ST_Y(h.location::geometry)                                                    AS hagwon_lat,
    ST_X(h.location::geometry)                                                    AS hagwon_lng,
    h.realm_sc_nm,
    h.le_crse_nm,
    h.fee_tier,
    h.popularity_score,
    h.age_groups,
    h.subject_category,
    ST_Distance(h.location::geography,
      ST_Point(p_home_lng, p_home_lat)::geography)                                AS dist_home
  FROM public.hagwon_db h, params
  WHERE h.is_active  = TRUE
    AND h.location   IS NOT NULL
    AND ST_DWithin(
      h.location::geography,
      ST_Point(params.center_lng, params.center_lat)::geography,
      params.radius_m
    )
    AND (p_age_group IS NULL OR h.age_groups @> ARRAY[p_age_group])
    AND (p_subject   IS NULL OR h.subject_category = p_subject)
  ORDER BY dist_home ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.recommend_hagwon_candidates TO anon, authenticated;


-- ============================================================
-- version: 20260619043107
-- name:    add_hagwon_blog_fields
-- 대응 로컬 파일: supabase/migrations/20260619000003_recommend_hagwon_candidates_v2.sql (blog_snippet 포함)
-- ============================================================

ALTER TABLE public.hagwon_db
  ADD COLUMN IF NOT EXISTS blog_snippet text,
  ADD COLUMN IF NOT EXISTS blog_tags    text[];

COMMENT ON COLUMN public.hagwon_db.blog_snippet IS '네이버 블로그 검색 스니펫 합본 (최대 10개, ~1500자)';
COMMENT ON COLUMN public.hagwon_db.blog_tags    IS 'AI 추출 태그 배열 (예: ["#수학전문","#친절한선생님"])';


-- ============================================================
-- version: 20260619062830
-- name:    assign_area_types
-- 대응 로컬 파일: supabase/migrations/20260619000000_assign_area_types.sql
-- ============================================================
-- assign_area_types(): 미매핑 거래를 complex_area_types에 연결
-- 전용면적 ±2.0m² nearest match (동일 면적 A/B는 naver_pyeong_no로 deterministic 처리)
CREATE OR REPLACE FUNCTION assign_area_types()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE transactions t
  SET area_type_id = (
    SELECT cat.id
    FROM complex_area_types cat
    WHERE cat.complex_id = t.complex_id
      AND ABS(cat.exclusive_area_m2 - t.area_m2) <= 2.0
    ORDER BY
      ABS(cat.exclusive_area_m2 - t.area_m2),  -- 전용면적 가장 근접
      cat.naver_pyeong_no NULLS LAST,           -- pyeongNo 오름차순 (A < B — deterministic)
      cat.id
    LIMIT 1
  )
  WHERE t.area_type_id IS NULL
    AND t.cancel_date IS NULL
    AND t.superseded_by IS NULL
    AND EXISTS (
      SELECT 1 FROM complex_area_types WHERE complex_id = t.complex_id
    );
$$;

-- ============================================================
-- version: 20260619072547
-- name:    recommend_hagwon_candidates_rpc
-- 대응 로컬 파일: supabase/migrations/20260619000002_recommend_hagwon_candidates_rpc.sql
-- ============================================================
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

-- ============================================================
-- version: 20260619075829
-- name:    recommend_hagwon_candidates_v2
-- 대응 로컬 파일: supabase/migrations/20260619000003_recommend_hagwon_candidates_v2.sql
-- ============================================================
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

-- ============================================================
-- version: 20260624045555
-- name:    backfill_area_types
-- 대응 로컬 파일: supabase/migrations/20260624000001_backfill_area_types.sql
-- ============================================================
SELECT assign_area_types();

-- ============================================================
-- version: 20260624045621
-- name:    area_type_trigger
-- 대응 로컬 파일: supabase/migrations/20260624000002_area_type_trigger.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_assign_area_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.area_type_id IS NULL AND NEW.cancel_date IS NULL THEN
    SELECT cat.id INTO NEW.area_type_id
    FROM public.complex_area_types cat
    WHERE cat.complex_id = NEW.complex_id
      AND ABS(cat.exclusive_area_m2 - NEW.area_m2) <= 2.0
    ORDER BY
      ABS(cat.exclusive_area_m2 - NEW.area_m2),
      cat.naver_pyeong_no NULLS LAST,
      cat.id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_area_type ON public.transactions;

CREATE TRIGGER trg_auto_assign_area_type
  BEFORE INSERT OR UPDATE OF area_m2, complex_id
  ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_area_type();

COMMENT ON FUNCTION public.auto_assign_area_type IS
  '신규 거래 INSERT 시 complex_area_types와 ±2㎡ nearest match로 area_type_id 자동 설정.';

-- ============================================================
-- version: 20260624045635
-- name:    rpc_add_exclusive_area
-- 대응 로컬 파일: supabase/migrations/20260624000003_rpc_add_exclusive_area.sql
-- ============================================================
DROP FUNCTION IF EXISTS public.complex_transactions_for_chart(uuid, text, integer, numeric);

CREATE OR REPLACE FUNCTION public.complex_transactions_for_chart(
  p_complex_id      uuid,
  p_deal_type       text,
  p_months          int     DEFAULT 120,
  p_area_m2         numeric DEFAULT NULL
) RETURNS TABLE (
  deal_date         text,
  year_month        text,
  price             numeric,
  area_m2           numeric,
  area_type_id      uuid,
  pyeong_name       text,
  exclusive_area_m2 numeric
) LANGUAGE sql STABLE AS $$
  SELECT
    t.deal_date::text                    AS deal_date,
    TO_CHAR(t.deal_date, 'YYYY-MM')      AS year_month,
    t.price::numeric                     AS price,
    t.area_m2::numeric                   AS area_m2,
    t.area_type_id                       AS area_type_id,
    cat.pyeong_name                      AS pyeong_name,
    cat.exclusive_area_m2                AS exclusive_area_m2
  FROM public.transactions t
  LEFT JOIN public.complex_area_types cat ON cat.id = t.area_type_id
  WHERE
    t.complex_id         = p_complex_id
    AND t.deal_type      = p_deal_type::public.deal_type
    AND t.deal_date      >= (NOW() - (p_months || ' months')::INTERVAL)::DATE
    AND t.cancel_date    IS NULL
    AND t.superseded_by  IS NULL
    AND (p_area_m2 IS NULL OR ROUND(t.area_m2) = ROUND(p_area_m2))
  ORDER BY t.deal_date ASC
$$;

COMMENT ON FUNCTION public.complex_transactions_for_chart IS
  'UX-01/UX-02: 개별 거래 행 반환. area_type_id/pyeong_name/exclusive_area_m2 포함. 미매핑 → NULL → Math.round fallback.';

-- ============================================================
-- version: 20260707051809
-- name:    area_type_ambiguity_guard
-- 대응 로컬 파일: supabase/migrations/20260707000000_area_type_ambiguity_guard.sql
-- ============================================================
-- 평형(area_type) 매칭 애매성 방지
--
-- 문제: 같은 단지 안에 전용면적이 2㎡ 이내로 붙어있는 평형(A/B 타입 등)이 흔함
-- (예: 35A=84.38㎡, 35B=84.10㎡ — 0.28㎡ 차이). 국토부 실거래가는 정확한 면적만
-- 제공하고 타입명을 안 주기 때문에, 기존 "±2㎡ 이내 최근접" 로직은 후보 간
-- 거리 차이가 작을 때(예: 84.24㎡ 거래) 사실상 추측으로 A/B를 결정하고 있었음.
--
-- 실측 결과(2026-07-07): 이미 배정된 거래 181,892건 중 64,990건(36%)이
-- 1등/2등 후보 거리 차이 0.3㎡ 미만 — 상당수가 잘못된 타입으로 배정됐을 수 있음.
--
-- 해결: 1등 후보가 2등 후보보다 최소 0.3㎡ 이상 더 가까울 때만 배정.
-- 애매하면 area_type_id를 NULL로 남김 — UI(area-groups.ts extractTypedAreaGroups)가
-- 이미 NULL을 "정수 m² 칩(예: 84㎡)"으로 안전하게 폴백 처리하므로 화면 깨짐 없음.

CREATE OR REPLACE FUNCTION assign_area_types()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH ranked AS (
    SELECT
      t.id AS tx_id,
      cat.id AS cat_id,
      ABS(cat.exclusive_area_m2 - t.area_m2) AS dist,
      ROW_NUMBER() OVER (
        PARTITION BY t.id
        ORDER BY ABS(cat.exclusive_area_m2 - t.area_m2), cat.naver_pyeong_no NULLS LAST, cat.id
      ) AS rn
    FROM transactions t
    JOIN complex_area_types cat ON cat.complex_id = t.complex_id
    WHERE t.area_type_id IS NULL
      AND t.cancel_date IS NULL
      AND t.superseded_by IS NULL
      AND ABS(cat.exclusive_area_m2 - t.area_m2) <= 2.0
  ),
  first_choice  AS (SELECT tx_id, cat_id, dist FROM ranked WHERE rn = 1),
  second_choice AS (SELECT tx_id, dist        FROM ranked WHERE rn = 2)
  UPDATE transactions t
  SET area_type_id = f.cat_id
  FROM first_choice f
  LEFT JOIN second_choice s ON s.tx_id = f.tx_id
  WHERE f.tx_id = t.id
    AND (s.dist IS NULL OR (s.dist - f.dist) >= 0.3);
$$;

COMMENT ON FUNCTION assign_area_types IS
  '미매핑 거래를 complex_area_types에 연결. ±2㎡ 이내 최근접이되, 2등 후보와 차이가
   0.3㎡ 미만이면(애매) 배정 보류 — area_type_id NULL 유지.';

CREATE OR REPLACE FUNCTION public.auto_assign_area_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  best_id     uuid;
  best_dist   numeric;
  second_dist numeric;
BEGIN
  IF NEW.area_type_id IS NULL AND NEW.cancel_date IS NULL THEN
    SELECT cat.id, ABS(cat.exclusive_area_m2 - NEW.area_m2)
      INTO best_id, best_dist
    FROM public.complex_area_types cat
    WHERE cat.complex_id = NEW.complex_id
      AND ABS(cat.exclusive_area_m2 - NEW.area_m2) <= 2.0
    ORDER BY ABS(cat.exclusive_area_m2 - NEW.area_m2), cat.naver_pyeong_no NULLS LAST, cat.id
    LIMIT 1;

    IF best_id IS NOT NULL THEN
      SELECT ABS(cat.exclusive_area_m2 - NEW.area_m2)
        INTO second_dist
      FROM public.complex_area_types cat
      WHERE cat.complex_id = NEW.complex_id
        AND cat.id != best_id
        AND ABS(cat.exclusive_area_m2 - NEW.area_m2) <= 2.0
      ORDER BY ABS(cat.exclusive_area_m2 - NEW.area_m2)
      LIMIT 1;

      IF second_dist IS NULL OR (second_dist - best_dist) >= 0.3 THEN
        NEW.area_type_id := best_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_assign_area_type IS
  '신규 거래 INSERT 시 complex_area_types와 ±2㎡ nearest match로 area_type_id 자동
   설정. 2등 후보와 거리 차이가 0.3㎡ 미만(애매)이면 배정 보류.';

-- 기존에 배정된 거래 중, 새 기준으로는 애매해서 배정하지 않았을 건들을 재평가하여
-- NULL로 되돌림 (오분류된 A/B 라벨을 화면에 계속 보여주는 것보다 안전)
WITH assigned AS (
  SELECT
    t.id AS tx_id,
    t.area_type_id AS current_cat_id,
    ABS(cat.exclusive_area_m2 - t.area_m2) AS current_dist
  FROM transactions t
  JOIN complex_area_types cat ON cat.id = t.area_type_id
  WHERE t.area_type_id IS NOT NULL
),
runner_up AS (
  SELECT
    a.tx_id,
    MIN(ABS(cat2.exclusive_area_m2 - t2.area_m2)) AS second_dist
  FROM assigned a
  JOIN transactions t2 ON t2.id = a.tx_id
  JOIN complex_area_types cat2
    ON cat2.complex_id = t2.complex_id
   AND cat2.id != a.current_cat_id
   AND ABS(cat2.exclusive_area_m2 - t2.area_m2) <= 2.0
  GROUP BY a.tx_id
)
UPDATE transactions t
SET area_type_id = NULL
FROM assigned a
LEFT JOIN runner_up r ON r.tx_id = a.tx_id
WHERE t.id = a.tx_id
  AND r.second_dist IS NOT NULL
  AND (r.second_dist - a.current_dist) < 0.3;


-- ============================================================
-- version: 20260709061130
-- name:    find_nearby_similar_complexes
-- 대응 로컬 파일: supabase/migrations/20260708000001_find_nearby_similar_complexes.sql
-- ============================================================
create or replace function find_nearby_similar_complexes(
  p_lat double precision,
  p_lng double precision,
  p_name_normalized text,
  p_exclude_kapt_code text,
  p_radius_m double precision,
  p_similarity_threshold real
) returns table(id uuid, canonical_name text, kapt_code text, dist_m double precision)
language sql stable as $$
  select c.id, c.canonical_name, c.kapt_code,
         ST_Distance(c.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as dist_m
  from complexes c
  where c.kapt_code is distinct from p_exclude_kapt_code
    and c.location is not null
    and ST_DWithin(c.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and similarity(c.name_normalized, p_name_normalized) > p_similarity_threshold
  order by dist_m;
$$;

comment on function find_nearby_similar_complexes is
  '좌표+이름유사 중복 Golden Record 후보 탐지 (log-only, 병합 없음). Phase 34-03에서 준비,
   34-05(카카오 지오코딩 후) detectPotentialDuplicate 헬퍼가 소비.';


-- ============================================================
-- version: 20260715030221
-- name:    realtrade_story_site_scoping
-- 대응 로컬 파일: supabase/migrations/20260715000001_realtrade_story_site_scoping.sql
-- ============================================================
-- 실거래이야기(realtrade-story)가 danjiondo와 같은 Supabase 프로젝트를 공유하면서
-- favorites/ad_campaigns가 두 사이트 간에 섞여 보이는 문제를 막기 위한 site_id 분리.
-- 조건부 가격알림(전고점 대비 하락률)에 필요한 컬럼도 함께 추가.

-- ── favorites: site_id 분리 ──
alter table public.favorites
  add column site_id text not null default 'danjiondo';

alter table public.favorites
  add constraint favorites_site_id_check check (site_id in ('danjiondo', 'realtrade-story'));

alter table public.favorites
  drop constraint favorites_user_id_complex_id_key;

alter table public.favorites
  add constraint favorites_user_id_complex_id_site_id_key unique (user_id, complex_id, site_id);

create index favorites_site_id_idx on public.favorites (site_id);

-- ── favorites: 조건부 가격알림 — 전고점 대비 하락률 조건 + 평형(면적타입) 단위 스코프 ──
alter table public.favorites
  add column area_type_id uuid references public.complex_area_types(id) on delete set null;

alter table public.favorites
  add column price_drop_rate_threshold numeric;

alter table public.favorites
  add constraint favorites_price_drop_rate_threshold_check
  check (price_drop_rate_threshold is null or (price_drop_rate_threshold > 0 and price_drop_rate_threshold <= 100));

comment on column public.favorites.price_drop_rate_threshold is
  '전고점 대비 하락률(%) 알림 조건. 전고점은 알림 체크 시점에 실거래 이력에서 매번 재계산 — 스냅샷 저장 안 함';

-- ── ad_campaigns: site_id 분리 ──
alter table public.ad_campaigns
  add column site_id text not null default 'danjiondo';

alter table public.ad_campaigns
  add constraint ad_campaigns_site_id_check check (site_id in ('danjiondo', 'realtrade-story'));

create index ad_campaigns_site_id_idx on public.ad_campaigns (site_id);

