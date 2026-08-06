-- get_hagwon_grade 미수식 참조 수정 (2026-08-06)
--
-- [증상] 호출 즉시 실패한다.
--   ERROR 42P01: relation "complexes" does not exist
--   CONTEXT: SQL function "get_hagwon_grade" during startup
--
-- [원인] `SET search_path TO ''`인데 본문이 `FROM complexes`로 **미수식 참조**한다.
-- search_path를 비우는 것은 SECURITY DEFINER 함수의 올바른 관행이지만, 그러면 본문의
-- 모든 객체를 스키마로 수식해야 한다. 둘 중 하나만 해서 함수가 통째로 죽어 있었다.
--
-- [영향] 학원 등급이 **한 번도 표시된 적이 없다**. hagwon_score가 있는 활성 단지가
-- 2,553곳인데 전부 등급이 비어 나온다. 호출부(src/lib/data/map-panel.ts:81)가
--
--   ((await supabase.rpc('get_hagwon_grade', {...})).data ?? null)
--
-- 로 error를 받지 않고 `.data ?? null`로 삼켜서, 화면에는 장애가 아니라 "정보 없음"으로
-- 보였다. 2026-07-31에 이미 발견돼 기록됐으나(NEXT-SESSION.md) 우회만 하고 방치됐다.
--
-- 이 프로젝트가 반복해 겪는 그 부류다 — 실패가 예외가 아니라 정상 응답의 모습으로 끝난다.
-- 호출부의 error 미확인은 별도 커밋에서 함께 고친다.
--
-- [수정] 본문의 테이블을 public.으로 수식한다. search_path=''는 그대로 둔다.

CREATE OR REPLACE FUNCTION public.get_hagwon_grade(p_complex_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH ranked AS (
    SELECT
      id,
      PERCENT_RANK() OVER (ORDER BY hagwon_score) AS pct
    FROM public.complexes
    WHERE hagwon_score IS NOT NULL
  )
  SELECT
    CASE
      WHEN pct >= 0.933 THEN 'A+'
      WHEN pct >= 0.867 THEN 'A'
      WHEN pct >= 0.800 THEN 'A-'
      WHEN pct >= 0.700 THEN 'B+'
      WHEN pct >= 0.600 THEN 'B'
      WHEN pct >= 0.500 THEN 'B-'
      WHEN pct >= 0.400 THEN 'C+'
      WHEN pct >= 0.300 THEN 'C'
      WHEN pct >= 0.200 THEN 'C-'
      ELSE 'D'
    END
  FROM ranked
  WHERE id = p_complex_id
$function$;
