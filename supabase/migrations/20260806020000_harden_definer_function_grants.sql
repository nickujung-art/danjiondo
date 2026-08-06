-- SECURITY DEFINER 함수 권한 정리 (2026-08-06)
--
-- Supabase security advisor가 anon 실행 가능한 SECURITY DEFINER 함수 15개를 지적했다.
-- 전수 확인해 실제 위험이 있는 것만 골라 고친다. anon 키는 클라이언트 번들에 박혀
-- 공개되는 값이므로, anon EXECUTE는 "인터넷 전체가 호출 가능"과 같은 뜻이다.
--
-- ============================================================
-- (1) award_daily_login_points — 임의 계정 포인트 지급
-- ============================================================
-- SECURITY DEFINER + anon EXECUTE + p_user_id를 **그대로 신뢰**했다. auth.uid() 확인이
-- 없어, 누구나 아래 한 줄로 임의 사용자에게 포인트를 적립할 수 있었다.
--
--   POST /rest/v1/rpc/award_daily_login_points  {"p_user_id": "<임의 uuid>"}
--
-- 함수 내부에 "하루 1회" 제한이 있어 폭주하지는 않지만, 매일 호출하면 activity_points가
-- 쌓이고 member_tier가 bronze→silver→gold로 올라간다. 이게 실거래이야기에 직접 닿는다 —
-- 알림 발송 지연이 등급에 따라 달라지므로(getNotificationDelay: 무료 회원 30분 지연),
-- 등급을 부풀리면 알림 지연을 우회할 수 있다.
--
-- 수정: 호출자가 본인일 때만 적립한다. 합법 호출부(src/actions/daily-login.ts)는 인증
-- 세션으로 user.id를 넘기므로 auth.uid()와 일치해 영향이 없다. anon EXECUTE도 회수한다
-- (anon은 auth.uid()가 NULL이라 어차피 실패하지만, 방어를 두 겹으로 둔다).
CREATE OR REPLACE FUNCTION public.award_daily_login_points(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_today   date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_already boolean;
BEGIN
  -- 호출자 본인 확인. 인자를 그대로 믿으면 남의 계정에 적립할 수 있다.
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RETURN false;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.activity_logs
    WHERE user_id = p_user_id
      AND reason = 'daily_login'
      AND (created_at AT TIME ZONE 'Asia/Seoul')::date = v_today
  ) INTO v_already;

  IF v_already THEN
    RETURN false;
  END IF;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.award_daily_login_points(uuid) FROM anon;

-- ============================================================
-- (2) assign_area_types() — 인자 없는 전체 배치를 anon이 호출 가능
-- ============================================================
-- 평형 자동 배정 배치다. 인자가 없어 누구나 호출만 하면 전체 스캔이 돈다.
-- Free 티어 IO에서 이건 그대로 DoS 수단이다(같은 이유로 refresh_complex_price_stats는
-- 41초가 걸려 8초 타임아웃에 걸렸다 — 이 인스턴스는 배치 한 번이 무겁다).
-- 배치는 service_role(스크립트·크론)만 돌리면 된다.
REVOKE EXECUTE ON FUNCTION public.assign_area_types() FROM anon, authenticated;

-- ============================================================
-- (3) 트리거 전용 함수 — 직접 호출 경로를 닫는다
-- ============================================================
-- returns trigger 라 직접 호출은 원래 의미가 없지만, 공개 실행 권한을 남겨둘 이유가 없다.
-- 트리거 발동에는 영향이 없다(트리거는 테이블 소유자 컨텍스트로 실행된다).
REVOKE EXECUTE ON FUNCTION public.award_comment_points()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_favorite_points() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_review_points()   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()       FROM anon, authenticated;

-- ============================================================
-- 손대지 않은 것 (판단 근거를 남긴다)
-- ============================================================
--  * increment_view_count(uuid)      — 조회수 집계. anon 호출이 설계 의도다.
--  * check_gps_proximity(...)        — boolean만 돌려주는 읽기 함수.
--  * get_recent_complex_sales(...)   — 공개 실거래 조회. 앱이 anon으로 쓴다.
--  * get_schools_for_point(...)      — 공개 학교 조회. 〃
--  * add_activity_points(...)        — 이미 auth.uid()를 확인한다.
--  * st_estimatedextent              — PostGIS 내장.
--
-- advisor가 함께 지적한 function_search_path_mutable 31건은 이 마이그레이션에서 다루지
-- 않는다. 대부분 SECURITY INVOKER라 권한 상승 경로가 아니고, search_path를 일괄로 바꾸면
-- 미수식 참조가 있는 함수가 조용히 깨진다 — get_hagwon_grade가 정확히 그 상태다
-- (search_path='' 인데 테이블을 미수식 참조해 호출 즉시 실패). 함수별로 본문을 확인하며
-- 따로 처리해야 한다.
