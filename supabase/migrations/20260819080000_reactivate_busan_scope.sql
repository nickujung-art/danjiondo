-- 부산 16개 자치구 수집 재개 — 2026-08-10 에 끈 스위치를 되돌린다 (Phase 41)
--
-- ── 배경 ────────────────────────────────────────────────────────────────────
-- 20260810060000_drop_busan_scope.sql.applied-manually 가 부산을 껐다. 원인은 데이터
-- 문제가 아니라 Supabase Free 500MB 한도 초과였다(565MB). Pro 전환(8GB)으로 그 전제가
-- 없어졌다. 그 파일의 "되돌리려면" 절 그대로 실행한다:
--   1) regions.is_active = true (부산 16개 구)
--   2) MOLIT 백필로 재수집 (백업 복원은 이후 창원·김해 변경분까지 되돌려 위험하다)
--
-- ── (1) regions 부산 16개 활성화 ─────────────────────────────────────────────
-- 조건을 sgg_code LIKE '26%' 로 두는 근거: 법정동코드 26xxx 는 부산광역시 전용이고,
-- 현재 regions 테이블의 26 으로 시작하는 행 16개 전수가 실제 부산 자치구다
-- (26110 26140 26170 26200 26230 26260 26290 26320 26350 26380 26410 26440 26470
--  26500 26530 26710). 조건 없는 멱등 UPDATE — 이미 true 인 행에 다시 적용해도 무해하고,
-- supabase/seed.sql 에는 부산 행이 없어 로컬 db reset 에서는 0행 영향으로 조용히 통과한다.
--
-- src/lib/data/regions.ts 의 getActiveSggCodes/getActiveCityNames/getActiveRegionAddrs 가
-- regions.is_active 를 동적으로 읽는 14곳 호출부의 유일한 지역 마스터 접근 경로다.
-- 코드 변경 없이 이 UPDATE 만으로 부산이 다음 배치부터 포함된다.
UPDATE public.regions
SET is_active = true
WHERE sgg_code LIKE '26%';

-- ── (2) 부산 ingest_runs 무효화 ──────────────────────────────────────────────
-- 🔴 이 DELETE 가 이 마이그레이션의 존재 이유다(D-02, 41-CONTEXT.md).
--
-- .github/workflows/molit-backfill-once.yml 이 `--resume` 를 하드코딩한다(입력값이 아니다).
-- scripts/backfill-realprice.ts 의 getCompletedRuns()(molit_trade)·getCompletedVillaRuns()
-- (molit_villa_trade) 가 ingest_runs 에서 status='success' 인 (source_id, sgg_code,
-- year_month) 를 skip 한다. 2026-08-10 삭제 때 ingest_runs 는 지우지 않았다.
--
-- → 이 DELETE 없이 백필을 부산 코드로 돌리면 apt 1,903건 + villa 1,853건 = 3,756건이
--   전부 skip 되고 "성공"으로 끝난다. 조용한 성공 — ADR-063 이 지목한 실패 모양이다.
--
-- 소비처 전수 조사 결과(41-CONTEXT.md <interfaces>):
--   scripts/backfill-realprice.ts       getCompletedRuns/getCompletedVillaRuns/cleanupStuckRuns
--                                        ← 이 DELETE 가 노리는 대상
--   scripts/backfill-officetel.ts       동일 resume 구조(molit_offi_trade) — 함께 지운다
--   scripts/check-ingest-linkage.ts     transactions 만 읽는다. ingest_runs 미참조 — 영향 없음
--   scripts/check-data-freshness.ts     source_run_id 임베디드 필터, 지역 무관 — 영향 없음
--   src/app/admin/region-expansion/page.tsx  부산 진행률이 0 으로 리셋 — 데이터가 실제로 0 이라
--                                        정직한 상태. 백필 진행에 따라 다시 채워진다
--   src/app/api/cron/rankings/route.ts  source_id='rankings' 로 INSERT/UPDATE 만 한다.
--                                        sgg_code 가 NULL 이라 아래 LIKE '26%' 에 걸리지 않는다
--
-- transactions.source_run_id 는 ingest_runs(id) ON DELETE SET NULL(20260430000008) 이고
-- 부산 거래가 이미 0행이라 참조하는 행 자체가 없다 — 이 DELETE 로 끊어질 참조가 없다.
--
-- molit_offi_trade 112행도 함께 지운다. 오피스텔 재수집 자체(backfill-officetel.ts 실행)는
-- 이 Phase 범위 밖이지만, 기록만 남고 데이터가 없는 상태를 남겨두지 않는다.
--
-- 대상 4,006행(molit_trade 1,975 / molit_villa_trade 1,919 / molit_offi_trade 112,
-- success 3,868) — 조건 없는 멱등 DELETE. 이미 지워진 뒤 재실행해도(로컬 db reset 포함)
-- 대상이 없어 0행 영향으로 조용히 통과한다.
DELETE FROM public.ingest_runs
WHERE sgg_code LIKE '26%';

-- ── (3) public.db_size_bytes() RPC 신설 ──────────────────────────────────────
-- scripts/busan-status.ts(Task 2)와 이후 6개 plan 의 용량 체크포인트가 쓴다.
-- PostgREST 로는 pg_database_size 를 부를 방법이 없고, psql 직결 경로는
-- BACKUP_AGENT_PASSWORD(GitHub secret)가 있어야 해서 로컬 실행자가 쓸 수 없다.
--
-- 🔴 search_path 가 빈 상태에서는 pg_catalog 조차 탐색되지 않는다(20260819030000 이
-- 세 번째로 겪은 함정: get_recent_complex_sales/get_schools_for_point 가 수식 누락으로
-- 호출 즉시 실패했었다). 본문 전체를 pg_catalog. 로 수식한다.
CREATE OR REPLACE FUNCTION public.db_size_bytes()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT pg_catalog.pg_database_size(pg_catalog.current_database());
$function$;

-- anon/authenticated 에는 주지 않는다 — DB 전체 용량은 service_role 전용 정보다.
REVOKE ALL ON FUNCTION public.db_size_bytes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.db_size_bytes() TO service_role;
