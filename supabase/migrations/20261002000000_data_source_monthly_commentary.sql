-- data_sources에 'monthly-commentary' 등록 (2026-10-02)
--
-- 월간 AI 해설 배치(generate-complex-commentary.ts)가 data_sources에 행이 없어
-- 감시견(ax-sub)이 실패 사유를 읽을 수 없었다. GITHUB_STEP_SUMMARY는
-- REST API에 노출되지 않고(summary: null), Actions 로그는 403이라
-- 감시견이 닿는 유일한 경로는 data_sources다.
--
-- cadence='monthly': 매월 1일 20:00Z (monthly-ai-commentary.yml)
-- expected_freshness_hours=1128: 47일 (maxAgeDays=45 + 여유 2일)

INSERT INTO public.data_sources
  (id, cadence, expected_freshness_hours, last_synced_at, last_status, consecutive_failures, ui_label)
VALUES
  ('monthly-commentary', 'monthly', 1128, NULL, NULL, 0, '월간 AI 해설 (Groq qwen3.8-27b)')
ON CONFLICT (id) DO UPDATE
  SET cadence                  = EXCLUDED.cadence,
      expected_freshness_hours = EXCLUDED.expected_freshness_hours,
      ui_label                 = EXCLUDED.ui_label;
