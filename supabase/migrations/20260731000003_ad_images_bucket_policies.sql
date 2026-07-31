-- Phase 38 (HARD-01) — ad-images 버킷·정책 최초 로컬 마이그레이션 + 보안 수정
--
-- 이 버킷과 두 정책은 로컬 마이그레이션 기록이 없었다
-- (grep -rn "ad_images_service_write\|'ad-images'" supabase/migrations/ → 0건,
--  Phase 37이 정리한 remote 전용 18건에도 없음). 이 파일이 최초 로컬 기록이다.
-- public=true는 광고 이미지 공개 읽기 의도이므로 그대로 유지한다.
-- ad_images_service_write에 auth.role() = 'service_role' 조건을 추가하는 것이
-- HARD-01의 핵심 수정이다 — 기존에는 역할 검사가 없어 anon 키 보유자도
-- ad-images 버킷에 임의 파일을 업로드할 수 있었다.

-- 버킷 (이미 존재하므로 멱등하게)
insert into storage.buckets (id, name, public)
values ('ad-images', 'ad-images', true)
on conflict (id) do nothing;

-- 공개 읽기 — 현행 유지 (광고 이미지 공개 읽기는 의도)
drop policy if exists "ad_images_public_read" on storage.objects;
create policy "ad_images_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'ad-images');

-- 업로드 — service_role 조건 추가 (이번 수정의 핵심)
drop policy if exists "ad_images_service_write" on storage.objects;
create policy "ad_images_service_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ad-images' and auth.role() = 'service_role');
