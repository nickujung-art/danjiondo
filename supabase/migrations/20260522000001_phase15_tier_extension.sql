-- Phase 15: 5단계 등급 체계 확장 + 즐겨찾기/일일 로그인 트리거 + cafe_articles 테이블
-- DIFF-01: 5단계 등급 체계 (브론즈/실버/골드/플래티넘/다이아)
-- DIFF-02: 포인트 임계값 및 배점 변경
-- DIFF-06: cafe_articles 테이블 신설

-- =============================================================================
-- 1. member_tier CHECK 제약 확장 (3단계 → 5단계)
-- =============================================================================
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_member_tier_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_member_tier_check
    CHECK (member_tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond'));

-- =============================================================================
-- 2. activity_logs reason CHECK 확장
--    'favorite', 'daily_login' 허용 추가
-- =============================================================================
ALTER TABLE public.activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_reason_check;
ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_reason_check
    CHECK (reason IN ('review', 'comment', 'gps_verify', 'daily_visit', 'first_favorite', 'favorite', 'daily_login'));

-- =============================================================================
-- 3. add_activity_points() 재정의 — 5단계 임계값
--    SECURITY DEFINER + SET search_path = '' 유지 (Phase 8 보안 패치 적용 상태 유지)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.add_activity_points(
  p_user_id uuid,
  p_points  integer,
  p_reason  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  INSERT INTO public.activity_logs (user_id, points, reason)
    VALUES (p_user_id, p_points, p_reason);

  UPDATE public.profiles
    SET
      activity_points = activity_points + p_points,
      member_tier = CASE
        WHEN activity_points + p_points >= 5000 THEN 'diamond'
        WHEN activity_points + p_points >= 2000 THEN 'platinum'
        WHEN activity_points + p_points >= 500  THEN 'gold'
        WHEN activity_points + p_points >= 100  THEN 'silver'
        ELSE 'bronze'
      END
    WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.add_activity_points IS
  'Phase 15 (DIFF-01/02): 5단계 임계값(100/500/2000/5000). SECURITY DEFINER — auth.uid() IS NULL 호출 차단.';

-- =============================================================================
-- 4. award_review_points() 재정의 — 10점 → 50점
-- =============================================================================
CREATE OR REPLACE FUNCTION public.award_review_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.add_activity_points(NEW.user_id, 50, 'review');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.award_review_points IS 'Phase 15 (DIFF-02): 후기 작성 +50점 (기존 10점에서 변경).';

-- =============================================================================
-- 5. award_comment_points() 재정의 — 3점 → 10점
-- =============================================================================
CREATE OR REPLACE FUNCTION public.award_comment_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.add_activity_points(NEW.user_id, 10, 'comment');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.award_comment_points IS 'Phase 15 (DIFF-02): 댓글 작성 +10점 (기존 3점에서 변경).';

-- =============================================================================
-- 6. award_favorite_points() 신규 함수 + user_favorites INSERT 트리거
-- =============================================================================
CREATE OR REPLACE FUNCTION public.award_favorite_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.add_activity_points(NEW.user_id, 5, 'favorite');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.award_favorite_points IS 'Phase 15 (DIFF-02): 즐겨찾기 추가 +5점.';

DROP TRIGGER IF EXISTS favorites_award_points ON public.favorites;
CREATE TRIGGER favorites_award_points
  AFTER INSERT ON public.favorites
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.award_favorite_points();

-- =============================================================================
-- 7. award_daily_login_points(p_user_id uuid) RETURNS boolean
--    CRITICAL: add_activity_points() 호출 금지
--    이유: SECURITY DEFINER 체인 내에서 auth.uid()가 NULL이므로
--          activity_logs INSERT + profiles UPDATE를 직접 수행한다.
--    반환값: true = 포인트 지급됨, false = 당일 이미 지급됨 (KST 기준)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.award_daily_login_points(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today   date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_already boolean;
BEGIN
  -- 당일 중복 방지 (KST 기준)
  SELECT EXISTS(
    SELECT 1 FROM public.activity_logs
    WHERE user_id = p_user_id
      AND reason = 'daily_login'
      AND (created_at AT TIME ZONE 'Asia/Seoul')::date = v_today
  ) INTO v_already;

  IF v_already THEN
    RETURN false;
  END IF;

  -- 직접 INSERT + UPDATE (add_activity_points()의 auth.uid() 체크를 우회)
  -- 호출자(Server Action)가 auth.getUser()로 검증한 p_user_id만 전달
  INSERT INTO public.activity_logs (user_id, points, reason)
    VALUES (p_user_id, 1, 'daily_login');

  UPDATE public.profiles
    SET
      activity_points = activity_points + 1,
      member_tier = CASE
        WHEN activity_points + 1 >= 5000 THEN 'diamond'
        WHEN activity_points + 1 >= 2000 THEN 'platinum'
        WHEN activity_points + 1 >= 500  THEN 'gold'
        WHEN activity_points + 1 >= 100  THEN 'silver'
        ELSE 'bronze'
      END
    WHERE id = p_user_id;

  RETURN true;
END;
$$;

-- anon이 직접 호출 불가 (T-15-DB-02)
REVOKE EXECUTE ON FUNCTION public.award_daily_login_points(uuid) FROM anon;

COMMENT ON FUNCTION public.award_daily_login_points IS
  'Phase 15 (DIFF-02): 일일 로그인 +1점. SECURITY DEFINER 체인에서 auth.uid() NULL 문제로 직접 INSERT/UPDATE. '
  'anon EXECUTE REVOKE 적용. KST 기준 당일 중복 방지. '
  'T-15-DB-02: p_user_id는 호출자(Server Action)가 auth.getUser()로 검증한 값만 전달.';

-- =============================================================================
-- 8. cafe_articles 테이블 신설 (DIFF-06)
--    기존 cafe_posts(NLP 매칭 결과 저장)와 별개 유지
--    cafe_articles: Naver cafearticle API 수집 결과 저장
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cafe_articles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id       uuid NOT NULL REFERENCES public.complexes(id) ON DELETE CASCADE,
  naver_article_id text NOT NULL UNIQUE,  -- item.link URL을 ID로 사용
  title            text NOT NULL,
  description      text,
  cafe_name        text,
  article_url      text NOT NULL,
  published_at     timestamptz,
  fetched_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cafe_articles_complex_id_idx
  ON public.cafe_articles(complex_id, published_at DESC);

ALTER TABLE public.cafe_articles ENABLE ROW LEVEL SECURITY;

-- SELECT: public (T-15-DB-03: cafe_articles는 공개 정보)
CREATE POLICY "cafe_articles: public read"
  ON public.cafe_articles FOR SELECT USING (true);

-- INSERT/UPDATE: service_role only (cron 워커, T-15-DB-03)
-- service_role은 RLS 정책을 우회하므로 별도 정책 불필요

COMMENT ON TABLE public.cafe_articles IS
  'Phase 15 (DIFF-06): Naver cafearticle API 수집 결과. '
  'naver_article_id UNIQUE으로 중복 방지. '
  'RLS: SELECT public, INSERT service_role only. '
  'cafe_posts(NLP 매칭, Phase 8)와 별개 테이블.';
