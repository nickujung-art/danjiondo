-- HARD-03 (Phase 38): recommend_hagwons 구버전 오버로드 DROP
--
-- 경위: 20260619000001_phase28_hagwon_system.sql이 recommend_hagwons(..., p_fee_tier TEXT, ...)를
-- 만들었고, 20260619000004_phase28_subject_v2.sql이 fee_tier_pref를 배열화하면서
-- p_fee_tiers TEXT[] 버전을 CREATE OR REPLACE했다. Postgres는 인자 타입이 다르면 별개
-- 함수로 취급하므로 CREATE OR REPLACE가 기존 함수를 덮어쓰지 못했고, 구버전이 DROP되지
-- 않은 채 신버전과 공존하게 됐다.
--
-- 앱 미사용 확인: `grep -rn "recommend_hagwons" src/ scripts/ --include=*.ts` → 결과는
-- src/types/database.ts(생성 타입, union) 1건뿐. 실제 호출부는
-- src/lib/data/hagwon-recommend.ts:21의 recommend_hagwon_candidates(별개 함수, 인자 7개)이며
-- recommend_hagwons를 부르는 코드는 없다. pg_stat_user_functions 호출 통계도 0이었다.
-- 오버로드 2개 공존 상태에서 인자를 명시하지 않고 호출하면 PostgREST가 모호성 에러를
-- 낼 수 있어 잠재적 DoS 위험이었다 — 구버전 제거로 오버로드를 1개로 축소해 제거한다.
--
-- 대상은 5번째 인자가 p_fee_tier TEXT인 구버전 하나뿐이다. p_fee_tiers TEXT[]인 신버전은
-- 인자 타입 6개를 전부 명시해 구분하며 DROP 대상에서 제외한다. 연쇄 삭제 옵션은 쓰지 않는다.
--
-- 이 파일은 20260619000001(구버전 CREATE)·20260619000004(신버전 CREATE OR REPLACE)보다
-- 뒤에 위치해야 db reset 최종 상태가 오버로드 1개로 수렴한다.
DROP FUNCTION IF EXISTS public.recommend_hagwons(
  double precision, double precision, text, text[], text, integer
);
