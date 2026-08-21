-- complex_integrity_counts 를 마이그레이션으로 파일화한다 (2026-08-21)
--
-- ── 왜 지금 ────────────────────────────────────────────────────────────────
-- 이 함수는 **프로덕션에만 존재했다.** 저장소 전체 grep 결과 참조는 3곳
-- (`.github/workflows/complex-integrity.yml`, 권한 복구 마이그레이션 20260819060000,
-- 그리고 임시 프로브)뿐이고 CREATE FUNCTION 이 어디에도 없었다 — 마이그레이션 drift 다.
-- Phase 41 이 이 사실을 발견하고 "범위 밖" 으로 기록해뒀다(41-CONTEXT 발견 5).
--
-- 파일화가 필요한 이유가 실제로 생겼다: 2026-08-21 에 `empty_kapt` 가 59 → 61 로
-- 움직였는데 **함수 정의를 볼 수 없어 원인을 판정할 수 없었다.** 감시 지표를 해석하려면
-- 그 지표의 정의가 저장소에 있어야 한다.
--
-- ── 정의를 보고 알게 된 것 ─────────────────────────────────────────────────
-- 1) `empty_kapt` 는 `household_count > 0` 을 요구한다. 그래서 enrich 가 건축물대장으로
--    세대수를 0에서 양수로 채우면 **그 단지가 집계 대상에 새로 들어온다.**
--    59 → 61 은 오염이 아니라 **모수가 넓어진 것**이다.
-- 2) `turnover_anomaly` 는 `tx.n / household_count / 10 * 100 > 25` — **10년 환산**이다.
--    세대수가 과소 기재된 소형 건물이 구조적으로 걸린다는 어제의 판단이 정의로 확인됐다.
-- 3) `multi_jibun` 은 지번의 **본번만**(`split_part(jibun,'-',1)`) 본다. 부번 차이는
--    무시하므로 같은 필지의 여러 동은 걸리지 않는다 — 다필지 단지에 관대한 설계다.
--
-- ── 이 마이그레이션은 동작을 바꾸지 않는다 ─────────────────────────────────
-- 프로덕션 정의를 `supabase db dump` 로 그대로 받아 옮긴 것이다. 재적용해도 같은 함수다.
-- 목적은 오직 **원장과 저장소를 일치시키는 것**이다(Phase 37 이 회복하려던 성질).

CREATE OR REPLACE FUNCTION "public"."complex_integrity_counts"("p_sgg" "text"[]) RETURNS TABLE("multi_jibun" integer, "turnover_anomaly" integer, "empty_kapt" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH j AS (
    SELECT t.complex_id,
           split_part(t.jibun,'-',1) AS base,
           t.umd_nm,
           count(*) AS cnt
    FROM public.transactions t
    WHERE t.complex_id IS NOT NULL AND t.jibun IS NOT NULL
      AND t.cancel_date IS NULL AND t.superseded_by IS NULL
      AND t.sgg_code = ANY(p_sgg)
    GROUP BY 1,2,3
  ),
  agg AS (
    SELECT complex_id,
           count(DISTINCT base) AS bases,
           count(DISTINCT umd_nm) AS dongs,
           sum(cnt) AS total,
           max(cnt) AS biggest
    FROM j GROUP BY 1
  ),
  tx AS (
    SELECT t.complex_id, count(*) AS n
    FROM public.transactions t
    WHERE t.complex_id IS NOT NULL
      AND t.cancel_date IS NULL AND t.superseded_by IS NULL
      AND t.sgg_code = ANY(p_sgg)
    GROUP BY 1
  )
  SELECT
    (SELECT count(*)::int FROM agg
      WHERE bases > 1 AND dongs > 1 AND (total - biggest) >= 50),
    (SELECT count(*)::int FROM public.complexes c JOIN tx ON tx.complex_id = c.id
      WHERE c.sgg_code = ANY(p_sgg) AND c.status = 'active' AND c.household_count > 0
        AND tx.n >= 100
        AND tx.n::numeric / c.household_count / 10 * 100 > 25),
    (SELECT count(*)::int FROM public.complexes c
      WHERE c.sgg_code = ANY(p_sgg) AND c.status = 'active'
        AND c.kapt_code IS NOT NULL AND c.household_count > 0
        AND NOT EXISTS (SELECT 1 FROM tx WHERE tx.complex_id = c.id));
$$;

