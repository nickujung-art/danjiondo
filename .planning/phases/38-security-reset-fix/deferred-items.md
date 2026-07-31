# Phase 38 — Deferred / Out-of-Scope Items

## 1. `supabase db reset` 실패 — `20260518000002_manual_aliases.sql` (Phase 38 범위 밖, 사전 존재 결함)

**발견 시점:** 38-01 Task 3 (`npm run db:reset` 실행 중)

`20260518000002_manual_aliases.sql`이 8개의 하드코딩된 `complex_id` UUID로
`complex_aliases`에 INSERT하는데, `supabase/seed.sql`은 `regions`·`data_sources`만
시딩하고 `complexes`는 전혀 시딩하지 않는다. 따라서 완전히 새로운 로컬 리셋에서는
`complexes` 테이블이 비어 있어 FK 제약(`complex_aliases_complex_id_fkey`)을 위반한다.

이 마이그레이션은 2026-05-18(Phase 33 이전)에 작성됐고 Phase 38의 HARD-02/03/04
변경분과 무관하다 — hollow dependency는 `supabase db reset`을 실측 실행한 이번이
처음이라 이제 드러난 것으로 보인다(과거 실행 이력에 이 실측이 없었음, 37-VERIFICATION.md
missing 3번 참고).

**조치 없음** — Phase 38 Scope Fence 밖. 38-CONTEXT.md `<scope_fence>` 원칙에 따라
수정하지 않고 사용자 보고로 처리. 해결 후보(참고용, 미채택):
- (a) `seed.sql`에 최소 8개 complex row를 추가해 로컬 시딩 커버리지 확보
- (b) `manual_aliases.sql`을 `on conflict do nothing` 유지한 채 FK 위반 건은
  `where exists (select 1 from complexes where id = ...)`로 방어적으로 감싸기 (마이그레이션
  내용 변경이라 Phase 37의 "충실 재현" 원칙과 충돌 여부 검토 필요)
- (c) 향후 phase에서 `db reset` 자동화 CI 게이트를 추가할 때 함께 해결

## 2. 미상 파일 — `20260731000003_fix_increment_view_count_security.sql`

**발견 시점:** 38-01 Task 3 이후 `migration list --linked` 재확인 중

`supabase/migrations/`에 untracked 상태로 존재. 이 세션에서 생성하지 않았다.
내용은 `increment_view_count()` 함수의 SECURITY INVOKER→DEFINER 전환(RLS 우회 버그 수정,
`realtrade-story` 언급)으로 Phase 38 범위와 무관하다. 기존 `20260731000003_ad_images_bucket_policies.sql`
(Wave 0, 이미 원장 applied)과 **타임스탬프가 충돌**한다 — 같은 저장소에서 동시에 작업 중인
다른 세션/에이전트가 생성한 것으로 추정된다.

**조치 없음** — 이 파일을 만들지도, 수정하지도, 삭제하지도 않았다. `git status --porcelain`에
계속 untracked로 남아 있으며 Phase 38 커밋에 포함되지 않았다. 사용자가 해당 작업의
소유자와 확인 후 타임스탬프를 재배치해야 한다(`db push` 시 두 `20260731000003` 파일 중
나중에 실행되는 쪽 순서가 비결정적일 수 있음).
