-- REVOKE 대상을 PUBLIC 까지 넓힌다 (2026-08-06)
--
-- [무엇이 잘못됐나]
-- 20260806020000 에서 SECURITY DEFINER 함수들의 실행 권한을 좁혔다고 기록했지만,
-- **실제로는 하나도 막히지 않았다.** 검증해 보니 그대로 anon 실행이 가능했다.
--
--   REVOKE EXECUTE ON FUNCTION ... FROM anon;            -- ← 효과 없음
--
-- Postgres 는 함수 생성 시 EXECUTE 를 **PUBLIC 에 기본 부여**한다. anon 은 PUBLIC 의
-- 일원이므로 anon 에게서만 회수해도 PUBLIC 경로로 여전히 실행할 수 있다.
-- has_function_privilege('anon', ...) 가 계속 true 였던 이유다.
--
-- 같은 날 작성한 20260806040000(refresh_complex_price_stats)만 우연히
-- `FROM PUBLIC, anon, authenticated` 로 써서 제대로 막혔고, 그 차이가 검증에서 드러났다.
--
-- 교훈: **권한 변경은 반드시 has_function_privilege 로 결과를 확인한다.**
-- REVOKE 는 대상이 틀려도 에러를 내지 않는다 — 이번 점검 내내 본 "조용한 실패"와 같은 부류다.
--
-- [수정]
-- award_daily_login_points 는 정상 호출부(src/actions/daily-login.ts)가 인증 세션으로
-- 부르므로 authenticated 에는 명시적으로 다시 부여한다. 함수 안에 auth.uid() 확인이
-- 있으므로 남의 계정에는 적립할 수 없다(20260806020000).

-- 1) 포인트 적립 — anon 차단, 로그인 사용자만
REVOKE EXECUTE ON FUNCTION public.award_daily_login_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.award_daily_login_points(uuid) TO authenticated;

-- 2) 인자 없는 전체 배치 — 서비스 롤만
REVOKE EXECUTE ON FUNCTION public.assign_area_types() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.assign_area_types() TO service_role;

-- 3) 트리거 전용 함수 — 직접 호출 경로를 닫는다(트리거 발동에는 영향 없다)
REVOKE EXECUTE ON FUNCTION public.award_comment_points()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_favorite_points() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_review_points()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()       FROM PUBLIC, anon, authenticated;

-- 손대지 않는 것(anon 호출이 설계 의도):
--   increment_view_count, get_hagwon_grade, get_recent_complex_sales,
--   get_schools_for_point, check_gps_proximity, add_activity_points(auth.uid() 확인 있음)
