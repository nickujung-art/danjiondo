-- 창부레터(changbuletter) 공유 Supabase 스키마 0단계 0-1·0-2.
-- 참고: .planning/vision/BRIEF.md §25-7 (0단계 선행 작업 목록), Phase 36 Wave 0.
--
-- 현재 site_id/role CHECK 제약이 danjiondo·realtrade-story·기존 role 값으로만 닫혀 있어
-- 창부레터 쪽 insert/update가 무조건 CHECK 위반으로 실패한다. 이 마이그레이션은 허용
-- 값을 넓히기만 한다 — 기존 행은 건드리지 않는다 (UPDATE/DELETE 없음).
--
-- ⚠️ ACCESS EXCLUSIVE 락 경고: `drop constraint` → `add constraint` 순서라 각 대상
-- 테이블(favorites·ad_campaigns·profiles)에 짧은 ACCESS EXCLUSIVE 락이 걸린다.
-- `add constraint`는 기존 행 전체를 검증 스캔한다. 세 테이블 모두 소규모라 실무상
-- 무해하지만, danjiondo·realtrade-story 운영 중 요청이 그 순간 대기할 수 있다.

-- ── favorites: site_id CHECK 확장 (+ 'changbuletter') ──
alter table public.favorites
  drop constraint favorites_site_id_check;

alter table public.favorites
  add constraint favorites_site_id_check
  check (site_id in ('danjiondo', 'realtrade-story', 'changbuletter'));

-- ── ad_campaigns: site_id CHECK 확장 (+ 'changbuletter') ──
alter table public.ad_campaigns
  drop constraint ad_campaigns_site_id_check;

alter table public.ad_campaigns
  add constraint ad_campaigns_site_id_check
  check (site_id in ('danjiondo', 'realtrade-story', 'changbuletter'));

-- ── profiles: role CHECK 확장 (+ 'cbl_editor') ──
-- 'admin'을 재사용하지 않는다: src/app/admin/layout.tsx:25가 role in ('admin','superadmin')
-- 으로 bds 어드민 콘솔을 게이트한다. 공유 profiles 테이블에서 창부레터 편집자에게 'admin'을
-- 부여하면 bds 어드민 전체 권한(광고 승인·회원 관리·GPS 승인·공인중개사 관리)이 즉시
-- 열리므로, 'cbl_editor' 신규 값을 추가하고 admin/layout.tsx는 이 마이그레이션에서
-- 수정하지 않는다(수정하지 않는 것이 권한 격리의 구현).
alter table public.profiles
  drop constraint profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin', 'superadmin', 'advertiser', 'cbl_editor'));
