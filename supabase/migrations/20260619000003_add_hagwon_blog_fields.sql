-- HARD-02 복원 (Phase 38): hagwon_db.blog_snippet / blog_tags 컬럼 DDL 복원
--
-- ① 원장 version 20260619043107 (name: add_hagwon_blog_fields)에서 원문 그대로 복원했다.
--    .planning/phases/37-migration-drift/ledger-backup-13-reverted.sql 340~351행 참조.
-- ② Phase 37 D-04의 오분류로 "reverted" 처리돼 로컬 마이그레이션에서 소실됐던 컬럼이다.
--    20260619000005_recommend_hagwon_candidates_v2.sql이 LANGUAGE sql 함수 본문에서
--    이 두 컬럼을 SELECT하는데, check_function_bodies=on(기본값)이라 CREATE 시점에
--    컬럼 존재를 검증한다 — 이 파일이 없으면 `supabase db reset`이 그 지점에서 실패한다.
-- ③ ADD COLUMN IF NOT EXISTS이므로 프로덕션 재적용은 no-op이다 (컬럼이 이미 존재).
--    이 파일의 목적은 프로덕션 스키마 변경이 아니라 로컬 `db reset` 재현성 복구다.

ALTER TABLE public.hagwon_db
  ADD COLUMN IF NOT EXISTS blog_snippet text,
  ADD COLUMN IF NOT EXISTS blog_tags    text[];

COMMENT ON COLUMN public.hagwon_db.blog_snippet IS '네이버 블로그 검색 스니펫 합본 (최대 10개, ~1500자)';
COMMENT ON COLUMN public.hagwon_db.blog_tags    IS 'AI 추출 태그 배열 (예: ["#수학전문","#친절한선생님"])';
