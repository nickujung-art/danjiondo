-- 로컬·섀도 DB 전용 롤 정의 (2026-08-27)
--
-- ── 왜 필요한가 ────────────────────────────────────────────────────────────
-- `backup_agent` 는 프로덕션에 **수동으로** 만들어졌고 마이그레이션 원장에 생성 구문이
-- 없다. 그런데 마이그레이션 5개가 가드 없이 이 롤을 참조한다:
--
--   20260806040000 · 20260807052310 · 20260807054343
--   20260810052504 · 20260819060000
--
-- 그래서 `supabase db reset` 과 `db diff` 의 섀도 빌드가 2026-08-06 이후 줄곧 깨져 있었다:
--
--     ERROR: role "backup_agent" does not exist (SQLSTATE 42704)
--     At statement: 2
--     GRANT EXECUTE ON FUNCTION public.refresh_complex_price_stats() TO service_role, backup_agent
--
-- 프로덕션은 롤이 실재하므로 `db push` 는 멀쩡히 통과한다 — **처음부터 재생할 때만**
-- 드러나는 유형이라 3주 동안 보이지 않았다.
--
-- ── 왜 마이그레이션에 가드를 다는 대신 여기서 만드나 ───────────────────────
-- 20260824 이후 마이그레이션 4개는 `if exists (select 1 from pg_roles ...)` 가드를 쓴다.
-- 가드는 "롤이 없으면 GRANT 를 건너뛴다" 는 뜻이라, 섀도에는 그 GRANT 가 없고 실물에는
-- 있는 상태가 된다 → **db diff 가 그 차이를 전부 drift 로 보고한다(거짓 양성).**
-- 섀도가 실물과 같아지려면 롤이 실재해야 한다. 그래서 여기서 만든다.
--
-- ── 🔴 비밀번호를 두지 않는다 ─────────────────────────────────────────────
-- 프로덕션 `backup_agent` 는 LOGIN 롤이고 비밀번호는 `BACKUP_AGENT_PASSWORD` 시크릿에
-- 있다(GitHub Actions 가 psql 직결에 쓴다). 이 파일은 저장소에 커밋되므로 자격증명을
-- 넣지 않는다. 스키마 비교에 LOGIN 은 필요 없다 — 마이그레이션들이 하는 일은
-- GRANT EXECUTE 와 ALTER ROLE BYPASSRLS 뿐이고 둘 다 NOLOGIN 롤에도 적용된다.
--
-- 로컬에서 백업 워크플로를 실제로 돌려봐야 한다면 그때만 임시로:
--     alter role backup_agent login password '<로컬 전용>';
--
-- ── 속성은 프로덕션과 맞춘다 ───────────────────────────────────────────────
-- BYPASSRLS 는 20260810052504 가 부여한다(백업이 6주째 스키마만 담기던 원인).
-- superuser·createrole·createdb 는 주지 않는다 — 프로덕션도 전부 false 다.
-- pg_read_all_data 멤버십은 전 테이블 SELECT 를 준다(쓰기 권한은 없다).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'backup_agent') then
    create role backup_agent nologin;
  end if;
end
$$;

grant pg_read_all_data to backup_agent;
