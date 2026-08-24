-- refresh_complex_canonical_jibun 에 backup_agent EXECUTE 부여 (2026-08-24)
--
-- ── 증상 ──────────────────────────────────────────────────────────────────
-- `Refresh Complex Price Stats` 워크플로가 2026-08-21·22·23 **3연속 실패**했다.
-- 마지막 성공은 08-21T05:19(수동 dispatch). Actions 로그의 진짜 메시지:
--
--   ERROR:  permission denied for function refresh_complex_canonical_jibun
--
-- ── 원인 ──────────────────────────────────────────────────────────────────
-- `20260821090000_complex_jibun_guard.sql` 이 이 함수를 만들면서 **GRANT 를 빠뜨렸다.**
-- 같은 워크플로가 앞줄에서 부르는 형제 함수는 받았다:
--
--   20260806040000:97  GRANT EXECUTE ON FUNCTION public.refresh_complex_price_stats()
--                        TO service_role, backup_agent;
--
-- `20260821*` 마이그레이션 5개 어디에도 GRANT 문이 없다(grep 확인). 함수를 새로 만들면서
-- **호출자가 누구인지**를 같이 적지 않은 것이다. 선례가 이미 있다 —
-- `20260819060000_restore_function_grants_lost_in_migration.sql`.
--
-- ── 영향 ──────────────────────────────────────────────────────────────────
-- 1) `complex_canonical_jibun.computed_at` 이 전 행 2026-08-21T07:56 에 멈췄다.
--    지번 게이트(`match_complex_by_admin`)가 **3일 낡은 확정 지번**으로 동작했다.
-- 2) 워크플로가 두 함수를 한 psql 호출에 이어 붙여 놓아, 앞이 성공해도 뒤가 죽으면
--    잡 전체가 실패가 된다. 로그상 `refresh_complex_price_stats()` 는 `(1 row)` 로
--    **성공했는데** `data_sources.price-stats` 는 `failed` 로 기록됐다 —
--    가격 파생값은 최신인데 감시는 빨간불이었다. 스텝 분리는 워크플로 쪽에서 함께 고친다.
--
-- ── 왜 역할 존재 가드를 두나 ────────────────────────────────────────────────
-- `backup_agent` 는 마이그레이션이 만들지 않는다(Supabase 에서 수동 생성). 형제 마이그레이션
-- (`20260806040000`, `20260810052504`)은 무가드로 참조하는데, 그러면 역할이 없는 환경에서
-- `supabase db reset` 이 그 지점에서 끊긴다 — Phase 38 이 정리한 **hollow dependency(클래스 A)**
-- 와 같은 모양이다. 프로덕션에는 역할이 있으므로 가드가 있든 없든 결과가 같고,
-- 없는 환경에서만 체인을 살린다. 그래서 여기서는 가드를 둔다.
--
-- ── 검증 ──────────────────────────────────────────────────────────────────
-- 🔴 `npm run db:push` 성공은 검증이 아니다. 워크플로를 workflow_dispatch 로 돌려
--    exit 0 과 `complex_canonical_jibun.computed_at` 갱신을 확인할 것.
--
-- ── 롤백 ──────────────────────────────────────────────────────────────────
-- REVOKE EXECUTE ON FUNCTION public.refresh_complex_canonical_jibun() FROM backup_agent;
--   ← 단, 그러면 확정 지번이 다시 갱신되지 않고 게이트가 낡아간다.

-- 공개 실행은 막는다 — 이 함수는 전 단지 다수결을 재계산하는 배치다.
REVOKE EXECUTE ON FUNCTION public.refresh_complex_canonical_jibun()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_complex_canonical_jibun() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_agent') THEN
    GRANT EXECUTE ON FUNCTION public.refresh_complex_canonical_jibun() TO backup_agent;
  ELSE
    RAISE NOTICE 'backup_agent 역할 없음 — GRANT 생략 (로컬/리셋 환경으로 간주)';
  END IF;
END
$$;

COMMENT ON FUNCTION public.refresh_complex_canonical_jibun() IS
  '단지 확정 지번(거래 다수결) 재계산 배치. match_complex_by_admin 의 지번 게이트가 참조한다. '
  'psql 직결로 돌린다(.github/workflows/refresh-price-stats.yml). SECURITY DEFINER — '
  'backup_agent 가 쓰기 권한 없이 트리거할 수 있게 하기 위함. '
  'EXECUTE 는 service_role·backup_agent 로 제한(20260824090000 에서 부여 — 최초 생성 시 누락).';
