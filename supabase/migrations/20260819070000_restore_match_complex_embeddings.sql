-- 리전 이전에서 누락된 `extensions.match_complex_embeddings` 를 복구한다.
--
-- [무슨 일이 있었나] 덤프가 `public`·`auth`·`storage` 중심이라 **`extensions` 스키마의
-- 사용자 정의 함수가 빠졌다.** 그 스키마의 유일한 사용자 객체였고(나머지는 확장이 만든 것),
-- 그래서 누락이 이 함수 하나로만 드러났다.
-- 실측: `extensions` 스키마 함수 수가 옛 174 → 새 173.
--
-- [왜 늦게 발견됐나] 이관 검증이 `public` 스키마에 집중돼 있었다. 스키마를 지정해 비교하면
-- **지정하지 않은 스키마는 조용히 검사 밖**이다 — 빠진 것은 어느 쪽 목록에도 안 나타난다.
--
-- [영향] 낮다. 호출처는 `src/app/api/chat/complex/route.ts` 하나뿐이고 폐기된 danjiondo
-- AI 챗 기능이다. 대상 테이블 `public.complex_embeddings` 는 양쪽 다 0행이라 기능이 휴면
-- 상태다. 그래도 복구하는 이유는 **옛 프로젝트를 지운 뒤에는 라이브 원본을 대조할 수 없기
-- 때문**이다. 지금 맞춰두면 두 DB 가 완전히 같아진다.
--
-- [정의 출처] 파일이 아니라 **옛 라이브 DB 의 `pg_get_functiondef()` 원문**을 그대로 옮겼다.
-- 마이그레이션 파일(20260508000003_pgvector.sql)에도 같은 이름이 있으나, 파일은 이후
-- 수정에 뒤처져 있을 수 있어 라이브를 권위로 삼는다.
--
-- [search_path 주의] 이 함수는 `SET search_path TO 'extensions','public'` 이다.
-- `<=>` 코사인 거리 연산자가 `extensions` 의 pgvector 소유라 그 스키마가 경로에 있어야 하고,
-- 테이블은 `public.` 으로 수식돼 있다. 빈 경로가 아니므로 이 저장소가 세 번 겪은
-- "search_path='' + 미수식 참조" 함정과는 다른 구조다 — 원문 그대로 유지한다.

CREATE OR REPLACE FUNCTION extensions.match_complex_embeddings(
  query_embedding vector,
  target_complex_id uuid,
  match_count integer DEFAULT 3
)
RETURNS TABLE(chunk_type text, content text, similarity double precision)
LANGUAGE sql
STABLE
SET search_path TO 'extensions', 'public'
AS $function$
  select
    chunk_type,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from public.complex_embeddings
  where complex_id = target_complex_id
  order by embedding <=> query_embedding
  limit match_count;
$function$;

-- 옛 프로젝트의 실효 권한과 동일하게 맞춘다(anon·authenticated·service_role 전부 실행 가능).
GRANT EXECUTE ON FUNCTION extensions.match_complex_embeddings(vector, uuid, integer)
  TO anon, authenticated, service_role;
