-- ============================================================
-- 창부레터 공유 스키마 0단계 0-3: RLS 정책
-- 원본: .planning/vision/BRIEF.md §25-6
-- 창부레터 저장소 docs/adr/ADR-003-rls-and-data-security.md 와 동일 내용 (일치 필수)
-- 대상: 20260730000002_cbl_content_schema.sql이 만든 신규 5개 테이블만.
-- 기존 테이블 정책은 이 마이그레이션에서 건드리지 않는다.
--
-- 저장소 기존 RLS 관행을 의도적으로 어기는 지점 3건 (D-05, 36-CONTEXT.md) —
-- 리뷰에서 "일관성 위반"으로 되돌리지 말 것:
--
-- ① 모든 정책에 `to` 절을 명시한다.
--    PostgreSQL 기본값은 `to public`이라 `to` 절이 없으면 anon에도 적용된다.
--    저장소의 유일한 anon-insert 선례 20260430000009_rls.sql:151-153의
--    "ad_events: authenticated insert" 정책이 정확히 그 버그다 — 이름은
--    "authenticated"인데 `to` 절이 없어 실제로는 anon에도 적용된다.
--    복사 금지, 반례로만 참고한다. (그 버그 자체의 수정은 이 Phase 범위 밖 — 별건)
--
-- ② `contents`에 `using (true)`를 쓰지 않는다.
--    저장소에는 `using (true)` + 앱 레이어 필터 관행이 있다(예: data_sources: public
--    read). contents에 적용하면 draft·예약발행 콘텐츠 유출이 앱 코드 실수 하나에
--    달린다. 발행 상태를 DB 레벨에서 강제한다.
--
-- ③ `subscribers`에 SELECT 정책을 만들지 않는다.
--    이메일 목록 덤프 방지 + 이메일 존재 여부 오라클 방지. 구독 중복 판정은
--    창부레터 Server Action(service_role)에서만 수행한다. 테이블 레벨 권한(grant/
--    revoke)은 회수하지 않는다(D-04 그대로 — bds 단독으로 추가하면 창부레터
--    ADR-003과 드리프트가 생긴다) — 따라서 SELECT 정책 미생성이 이메일 보호의
--    유일한 방어선이다.
--
-- 테이블 레벨 grant/revoke 구문은 넣지 않는다. complexes(20260430000009_rls.sql:
-- 62-63)가 명시적 GRANT 없이 RLS 정책만으로 공개 읽기를 제공하는 선례이며, 이
-- 프로젝트는 Supabase 기본 권한이 anon에 부여된 상태이므로 RLS가 유일한 차단막이다.
-- ============================================================

alter table public.contents enable row level security;

-- 발행된 것만 공개 읽기 (draft·scheduled는 anon에 절대 안 보임)
create policy "contents: public read published"
  on public.contents for select
  to anon, authenticated
  using (status = 'published' and published_at <= now());

-- 편집자 전체 접근
create policy "contents: editor all"
  on public.contents for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('cbl_editor', 'superadmin')
    )
  );

alter table public.subscribers enable row level security;

-- 구독 신청: anon INSERT만. SELECT 정책이 없으므로 목록 조회 불가
create policy "subscribers: anon subscribe"
  on public.subscribers for insert
  to anon, authenticated
  with check (site_id = 'changbuletter' and status = 'pending');

-- 북마크 / 투표: 본인 것만
alter table public.content_bookmarks enable row level security;
create policy "content_bookmarks: own"
  on public.content_bookmarks for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.content_votes enable row level security;
create policy "content_votes: own"
  on public.content_votes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 관련 단지 연결: 연결된 콘텐츠가 발행 상태일 때만 공개
alter table public.content_complexes enable row level security;
create policy "content_complexes: public read"
  on public.content_complexes for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.contents c
      where c.id = content_id
        and c.status = 'published' and c.published_at <= now()
    )
  );
create policy "content_complexes: editor write"
  on public.content_complexes for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('cbl_editor', 'superadmin')
    )
  );
