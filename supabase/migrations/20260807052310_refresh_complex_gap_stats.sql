-- 갭 통계 배치를 psql 직결로 돌리기 위한 SECURITY DEFINER 래퍼 (2026-08-07)
--
-- [배경 — refresh_complex_price_stats 와 같은 벽에 부딪혔다]
-- /api/cron/daily 가 PostgREST 로 compute_gap_stats 를 부르고 결과를 앱에서 UPSERT 하는
-- 구조였는데, 실행시간이 8초 선을 넘나들게 됐다. 실측(2026-08-07, EXPLAIN ANALYZE):
--   * cold  11.45초   ← Index Only Scan 인데 Heap Fetches 104,920
--   * warm  0.35~5.1초
--   * PostgREST 세션 상한  8초 (authenticator 롤 statement_timeout)
--
-- **"항상 넘는다"가 아니라 "cold 면 넘는다"이고, 크론이 도는 조건이 정확히 cold 다.**
-- 19:00 UTC(04:00 KST)는 DB 가 밤새 놀다 깨는 시각이라 버퍼 캐시가 비어 있다.
-- 실제로 data_sources.gap-stats 가 'failed' 로 굳었고 complex_gap_stats 는 2026-08-05
-- 이후 갱신되지 않았다.
--
-- cold 가 이렇게 비싼 근본 원인은 따로 있다: transactions 에 dead tuple 151,452건(18%)이
-- 쌓였는데 autovacuum 이 2026-07-25 이후 돌지 않아 visibility map 이 낡았다. 그래서
-- Index Only Scan 이 heap 을 10만 번 친다. **vacuum 을 손보면 이 함수는 8초 밑으로
-- 내려올 수 있다** — 그래도 직결로 빼는 게 맞다고 본 이유는, 임계값 바로 아래에 두면
-- 데이터가 조금만 더 늘어도 다시 넘고 그 실패가 조용하기 때문이다.
--
-- 2026-08-06 에 refresh_complex_price_stats(41~46초)가 똑같은 이유로 죽어 있던 걸
-- psql 직결 워크플로로 뺐다(20260806040000). gap-stats 가 그 다음 차례일 뿐이다.
-- **이 벽은 앞으로도 다른 배치를 차례로 넘어뜨린다** — 새 집계 배치를 만들 때는
-- 처음부터 8초를 넘길지 재고 직결 여부를 정하는 게 맞다.
--
-- [이 마이그레이션이 하는 일]
-- 직결에 쓸 수 있는 로그인 롤은 backup_agent 하나뿐인데(BACKUP_AGENT_PASSWORD 시크릿이
-- 이미 있다), 권한을 실측하면 SELECT 와 compute_gap_stats EXECUTE 는 되지만
-- complex_gap_stats INSERT/UPDATE 는 안 된다. 그 읽기 전용은 의도된 설계다.
--
-- 그래서 계산과 반영을 한 함수 안에 넣고 SECURITY DEFINER 로 소유자(postgres) 권한에
-- 실행시킨다. 백업 롤에 쓰기 권한을 주지 않고도 이 배치만 돌릴 수 있다.
--
-- [보안 고려 — 20260806040000 과 동일한 판단]
--   * 본문의 모든 객체를 public. 으로 수식하고 `SET search_path = ''` 를 건다.
--     수식 없이 DEFINER 를 걸면 search_path 조작으로 권한 상승이 가능하다.
--     compute_gap_stats 본문도 이미 전부 수식돼 있음을 확인했다(그렇지 않으면
--     빈 search_path 아래서 즉사한다 — get_hagwon_grade 가 그 전례다).
--   * 기본 EXECUTE 는 PUBLIC 에 열려 있다. 이건 11초짜리 전체 재계산이라 Free 티어에서
--     그대로 DoS 수단이다. PUBLIC·anon·authenticated 에서 회수하고 실제로 돌릴 둘에만 남긴다.
--   * 멱등한 재계산이라 파괴적이지 않다 — 자격증명이 새더라도 할 수 있는 일은 "지표 재계산"뿐.
--
-- [risk_level 임계값 — 원래 앱(computeRiskLevel)에 있던 D-02 판정을 여기로 옮겼다]
-- 호출부가 사라져 TS 쪽이 死코드가 되므로, 두 정의가 갈라지지 않도록 SQL 을 단일
-- 진실 원천으로 삼는다. 판정 근거:
--   gap_ratio < 0   역전세(전세가 > 매매가) = 깡통전세 위험  → danger
--   0 ≤ gap_ratio < 40                소자본 갭투자 가능      → safe
--   40 ≤ gap_ratio ≤ 60                                      → caution
--   gap_ratio > 60  고자본 필요                              → danger
-- 값 집합은 complex_gap_stats_risk_level_check 제약과 일치해야 한다. 읽는 쪽
-- (realtrade-story getGapBadge)은 모르는 값이면 배지를 숨기므로, 오타가 나면
-- 에러가 아니라 **배지가 조용히 사라진다.**

CREATE OR REPLACE FUNCTION public.refresh_complex_gap_stats(p_window_months integer DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.complex_gap_stats AS t (
    complex_id,
    median_sale_price,
    median_jeonse_price,
    gap_amount,
    gap_ratio,
    jeonse_ratio,
    risk_level,
    sale_count,
    jeonse_count,
    window_months,
    computed_at
  )
  SELECT
    g.complex_id,
    g.median_sale_price,
    g.median_jeonse_price,
    g.gap_amount,
    g.gap_ratio,
    g.jeonse_ratio,
    CASE
      WHEN g.gap_ratio <  0  THEN 'danger'
      WHEN g.gap_ratio <  40 THEN 'safe'
      WHEN g.gap_ratio <= 60 THEN 'caution'
      ELSE 'danger'
    END,
    g.sale_count,
    g.jeonse_count,
    p_window_months,
    now()
  FROM public.compute_gap_stats(p_window_months) g
  ON CONFLICT (complex_id) DO UPDATE SET
    median_sale_price   = EXCLUDED.median_sale_price,
    median_jeonse_price = EXCLUDED.median_jeonse_price,
    gap_amount          = EXCLUDED.gap_amount,
    gap_ratio           = EXCLUDED.gap_ratio,
    jeonse_ratio        = EXCLUDED.jeonse_ratio,
    risk_level          = EXCLUDED.risk_level,
    sale_count          = EXCLUDED.sale_count,
    jeonse_count        = EXCLUDED.jeonse_count,
    window_months       = EXCLUDED.window_months,
    computed_at         = EXCLUDED.computed_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- 표본 기준(sale_count·jeonse_count 각 3건 이상)을 못 채우게 된 단지는 compute_gap_stats
  -- 결과에서 빠지는데, 그 행은 **여기서 지워지지 않고 옛 값으로 남는다.** 앱은 computed_at
  -- 을 함께 읽으므로 낡음을 표시할 수 있고, 지우면 "한때 있던 지표가 사라지는" 쪽이 더
  -- 혼란스럽다고 보고 남기는 쪽을 택했다. 정리가 필요해지면 별도 배치로 다룬다.
  RETURN v_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_complex_gap_stats(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_complex_gap_stats(integer) TO service_role, backup_agent;

COMMENT ON FUNCTION public.refresh_complex_gap_stats(integer) IS
  '갭 통계 배치 집계·반영. compute_gap_stats 가 11초대라 PostgREST 8초 타임아웃을 넘길 수 '
  '없어 psql 직결로 돌린다(.github/workflows/refresh-gap-stats.yml). SECURITY DEFINER — '
  'backup_agent 가 쓰기 권한 없이 트리거할 수 있게 하기 위함. EXECUTE 는 service_role·'
  'backup_agent 로 제한. risk_level 임계값의 단일 진실 원천이다.';
