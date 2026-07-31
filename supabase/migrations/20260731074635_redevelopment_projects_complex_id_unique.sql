-- redevelopment_projects 에 UNIQUE (complex_id) 추가. (Phase 39 F-04)
--
-- [배경]
-- 어드민 저장(src/lib/actions/redevelopment-actions.ts)이 `onConflict: 'complex_id'` 로
-- upsert 하는데 정작 그 컬럼에 유니크 제약이 없었다(PK(id) 뿐). ON CONFLICT 추론이 실패해
-- 42P10 으로 **저장이 100% 실패**했고, 실제로 이 테이블은 2026-07-31 기준 0행이다.
--
-- [왜 제약을 추가하는가 — 앱을 고치지 않고]
-- 코드 주석이 "complex_id 기준 — 단지당 1개 row" 라고 명시한다. 즉 앱은 처음부터 이 제약이
-- 있다고 가정하고 쓰였고, 빠진 쪽은 스키마다. 단지당 재건축 프로젝트가 여러 개일 이유도 없다.
-- (new_listings·favorites 는 반대였다 — 그쪽은 부분 인덱스가 **의도된 설계**라 앱을 고쳤다.)
--
-- 기존 행이 0건이라 중복 검사 없이 바로 붙일 수 있다.
-- complex_id 가 nullable 이어도 Postgres 는 NULL 을 서로 다른 값으로 취급하므로
-- "단지 미지정" 행이 여러 개 생기는 것은 막지 않는다 — 그건 이 제약의 목적이 아니다.

alter table public.redevelopment_projects
  add constraint redevelopment_projects_complex_id_key unique (complex_id);

-- [적용 후 검증]
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.redevelopment_projects'::regclass and contype='u';
--   -- redevelopment_projects_complex_id_key | UNIQUE (complex_id)
