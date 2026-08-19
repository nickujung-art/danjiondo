-- 리전 이전(시드니→서울) 과정에서 조용히 풀린 함수 EXECUTE 권한을 옛 상태로 되돌린다.
--
-- [무슨 일이 있었나]
-- `pg_dump` 가 만든 schema.sql 자체는 옳았다 — 각 함수마다
--   REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--   GRANT  ALL ON FUNCTION ... TO service_role;   (필요한 곳만 authenticated/backup_agent)
-- 로 잠그고 있고 `anon` 에게 주는 GRANT 는 어디에도 없다.
--
-- 문제는 **Supabase 프로젝트의 기본 권한**이다. 두 프로젝트 모두
--   ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated
-- 가 걸려 있다(`pg_default_acl`, 양쪽 동일). 이건 `PUBLIC` 을 거치지 않고 **anon·authenticated 에게
-- 직접** 주는 규칙이라, 덤프의 `REVOKE ... FROM PUBLIC` 이 건드리지 못한다. 그래서 새 프로젝트에서
-- `CREATE FUNCTION` 이 실행될 때마다 기본 권한이 anon·authenticated 를 **도로 붙였고**, 덤프의
-- REVOKE 는 그걸 떼지 못했다. 원본에서는 그 뒤에 사람이 명시적으로 REVOKE 한 상태였기 때문에
-- 차이가 생겼다.
--
-- [실측] public 스키마 함수 821개를 양쪽 `has_function_privilege` 로 전수 대조해
-- **정확히 11개**가 다른 것을 확인했다. 아래가 그 11개다.
-- (`add_activity_points` 는 옛 프로젝트에서도 anon=true 라 회귀가 아니므로 건드리지 않는다.)
--
-- [실제로 뚫렸다] 운영 번들의 공개 anon 키로 PostgREST 를 호출해 확인했다:
--   complex_integrity_counts / unique_indexes_for_table / compute_gap_stats → 전부 HTTP 200.
--   대조군(존재하지 않는 함수)은 404 라, 200 은 진짜 실행이라는 뜻이다.
-- 쓰기·고비용 함수(refresh_*, assign_area_types, award_*)는 **일부러 호출하지 않았다** —
-- 같은 ACL 이므로 호출 가능하다는 결론은 같고, 실행하면 실제로 배치가 돌거나 데이터가 바뀐다.
--
-- [위험]
--  - `refresh_complex_price_stats()` / `refresh_complex_gap_stats(int)` / `assign_area_types()`
--    → 익명 누구나 **무거운 전체 재계산 배치**를 반복 호출할 수 있다(비용·가용성).
--  - `award_daily_login_points(uuid)` → 익명이 임의 사용자에게 포인트를 줄 수 있다.
--    이건 anon 만 뗀다 — 옛 프로젝트에서 `authenticated` 는 true 였고
--    `bds/src/actions/daily-login.ts` 가 로그인 사용자로 호출한다.
--  - 트리거 반환 함수 4종(award_comment/favorite/review_points, handle_new_user)은
--    PostgREST 로 직접 호출되지는 않지만, 옛 상태와 맞추기 위해 함께 되돌린다.
--
-- [정당한 호출자는 영향 없음] 전부 확인했다:
--   refresh_* · complex_integrity_counts → GitHub Actions 가 `backup_agent` 로 psql 직결
--   assign_area_types · unique_indexes_for_table → 스크립트/테스트가 service_role 로 호출
--   award_daily_login_points → authenticated (유지한다)
--
-- [교훈] 논리 덤프/복원은 **권한을 완전히 옮기지 못한다.** 대상 프로젝트의 기본 권한이
-- 덤프가 모르는 규칙을 갖고 있으면, 덤프가 옳아도 결과가 달라진다. 이관 검증에 행 수·스키마만이
-- 아니라 **ACL 전수 대조**가 들어가야 하는 이유다.

REVOKE EXECUTE ON FUNCTION public.assign_area_types()                        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_comment_points()                     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_favorite_points()                    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_review_points()                      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complex_integrity_counts(text[])           FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_gap_stats(integer)                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_complex_gap_stats(integer)         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_complex_price_stats()              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unique_indexes_for_table(text)             FROM anon, authenticated;

-- 이것만 anon 한정 — authenticated 는 옛 상태에서 허용이었고 실제로 쓰인다.
REVOKE EXECUTE ON FUNCTION public.award_daily_login_points(uuid)             FROM anon;
