-- [BUG FIX] increment_view_count가 한 번도 동작하지 않았다.
-- realtrade-story 라이브 확인(2026-07-31): complexes 4,285개 전부 view_count = 0.
-- 0보다 큰 단지가 단 하나도 없다.
--
-- [원인]
-- 함수는 존재하고 anon에 EXECUTE도 부여돼 있었지만 SECURITY INVOKER였다:
--     prosecdef = false, has_function_privilege('anon', ..., 'EXECUTE') = true
-- 즉 본문의 UPDATE가 호출자(anon) 권한으로 실행되는데, complexes의 RLS 정책은
-- "complexes: public read" (SELECT) 하나뿐이라 UPDATE에 매칭되는 permissive 정책이 없다.
--
-- 핵심은 이게 에러를 내지 않는다는 점이다 — RLS에 막힌 UPDATE는 권한 오류가 아니라
-- **0행 수정**으로 조용히 성공한다. 그래서 rpc() 호출의 error가 null이고, 앱의
-- incrementViewCount는 아무 예외도 던지지 않았다. 증상은 화면의 "조회 0회"뿐이었고
-- 그게 정상값처럼 보여 오랫동안 발견되지 않았다.
--
-- [영향]
-- realtrade-story F-01-06(홈 발견 "인기" TOP5)과 랭킹 탭 조회수 정렬이 전부 0인 값으로
-- 정렬돼 사실상 무작위 순서였다. danjiondo도 같은 함수를 공유하므로 동일하게 영향받는다.
--
-- [해결]
-- SECURITY DEFINER로 전환해 RLS를 우회한다. anon에 complexes UPDATE 정책을 여는 대안은
-- 택하지 않았다 — RLS 정책은 컬럼 단위 제한이 어려워 view_count 외 컬럼(가격 통계 등)까지
-- 변조 가능해진다. 이 함수는 단일 컬럼 +1만 수행하므로 노출면이 훨씬 좁다.
--
-- search_path를 ''로 고정하고 테이블을 스키마 수식한다 — SECURITY DEFINER 함수에서
-- search_path를 열어 두면 호출자가 동명 객체를 심어 함수 소유자 권한으로 실행시킬 수 있다.
-- (같은 프로젝트의 get_hagwon_grade는 search_path=''를 설정하고도 테이블을 수식하지 않아
--  호출 즉시 "relation does not exist"로 실패한다 — 그 실수를 반복하지 않도록 주의.)
create or replace function public.increment_view_count(p_complex_id uuid)
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.complexes
     set view_count = view_count + 1,
         updated_at = now()
   where id = p_complex_id;
$function$;

grant execute on function public.increment_view_count(uuid) to anon, authenticated;

-- [적용 후 검증]
--   select view_count from public.complexes where id = '<아무 단지 id>';
--   select public.increment_view_count('<같은 id>'::uuid);
--   select view_count from public.complexes where id = '<같은 id>';  -- 1 증가해야 성공
-- 앱 쪽에서는 단지상세를 새 세션으로 열었을 때 view_count가 오르는지 확인한다
-- (ViewCountTracker가 sessionStorage로 세션당 1회만 호출하므로 같은 탭 새로고침은 증가하지 않는다).
