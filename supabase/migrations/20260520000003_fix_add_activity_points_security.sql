-- add_activity_points: anon 호출 차단 + 인증 체크 추가
-- SECURITY DEFINER 함수가 anon role에 노출되어 있어 비로그인 사용자가
-- 임의 user_id로 포인트 조작 가능했던 문제 수정

REVOKE EXECUTE ON FUNCTION public.add_activity_points(uuid, integer, text) FROM anon;

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
        WHEN activity_points + p_points >= 200 THEN 'gold'
        WHEN activity_points + p_points >= 50  THEN 'silver'
        ELSE 'bronze'
      END
    WHERE id = p_user_id;
END;
$$;
