-- complex_integrity_counts 의 권한을 함수 생성 **뒤에** 다시 못박는다 (2026-08-27)
--
-- ── 재생할 때만 열리는 구멍이었다 ──────────────────────────────────────────
-- 원장의 순서가 이렇다:
--
--   20260819060000  REVOKE EXECUTE ... FROM anon, authenticated   ← 함수가 아직 없다
--   20260821140000  CREATE OR REPLACE FUNCTION complex_integrity_counts(...)
--                   ↑ GRANT/REVOKE 가 **한 줄도 없다**
--
-- 프로덕션에서는 문제가 없었다 — 함수가 08-19 이전에 SQL Editor 로 만들어져 있었고
-- CREATE OR REPLACE 는 기존 권한을 보존하기 때문이다. 실측으로 확인했다:
--   anon 호출 → HTTP 401 / 42501 permission denied  ✅
--
-- 그런데 **빈 DB 에서 재생하면 정반대가 된다.** REVOKE 는 함수가 없어 죽고(42883),
-- 그다음 CREATE 가 함수를 새로 만들면서 **PostgreSQL 기본값인 PUBLIC EXECUTE** 를 받는다.
-- 취소할 구문은 이미 지나갔다. 즉 **20260819060000 이 막으려던 노출이 그대로 다시 열린다.**
-- 그 마이그레이션이 고쳤던 사고가 "운영 anon 키로 호출하니 HTTP 200 이 나왔다" 였다.
--
-- ── 그래서 두 군데를 고쳤다 ────────────────────────────────────────────────
-- ① 20260819060000 의 그 한 줄을 조건부로 감쌌다 (없으면 건너뛴다 → 재생이 멈추지 않는다)
-- ② 이 파일이 함수 생성 뒤에 **의도한 권한 상태를 확정한다**
--
-- ①만으로는 안 된다. 건너뛰기만 하면 재생된 DB 는 PUBLIC EXECUTE 인 채로 남는다.
--
-- ── 프로덕션에는 변화가 없다 ───────────────────────────────────────────────
-- 이미 같은 상태다. 재적용해도 결과가 같은 멱등 구문이다.

-- 🔴 PostgreSQL 은 새 함수의 EXECUTE 를 PUBLIC 에 기본 부여한다. anon·authenticated 만
--    취소하면 PUBLIC 경유로 여전히 실행된다 — public 부터 회수한다.
revoke execute on function public.complex_integrity_counts(text[]) from public, anon, authenticated;

-- 정당한 호출자: GitHub Actions(complex-integrity.yml)가 backup_agent 로 psql 직결,
-- 스크립트·테스트는 service_role.
grant execute on function public.complex_integrity_counts(text[]) to service_role;
-- 🔴 do $$ … $$ 블록을 쓰지 않는다 — 섀도 빌드의 구문 분리기가 처리하지 못한다.
--    roles.sql 이 섀도·로컬에 backup_agent 를 보장하고 프로덕션에는 실재하므로 무조건 부여한다.
grant execute on function public.complex_integrity_counts(text[]) to backup_agent;

-- ── [적용 후 검증] ─────────────────────────────────────────────────────────
-- anon 키로 호출해 HTTP 401 / 42501 이 나와야 한다. 200 이면 뚫린 것이다.
--   POST {SUPABASE_URL}/rest/v1/rpc/complex_integrity_counts  {"p_sgg":["48121"]}
