-- data_sources에 'price-stats' 등록 (2026-08-06)
--
-- refresh_complex_price_stats()는 4주간(2026-07-09~08-05) 조용히 실패했는데,
-- data_sources에 해당 항목이 없어 data-freshness-check.yml이 구조적으로 볼 수 없었다.
-- 감시 대상에 없는 단계는 얼마를 멈춰 있어도 아무도 모른다.
--
-- 함께 고친 것(같은 커밋):
--   * route.ts가 supabase.rpc()의 error를 직접 확인한다 — rpc()는 throw하지 않고
--     { data, error }를 돌려주므로 기존 try/catch는 RPC 에러에 발동한 적이 없었다.
--   * 성패를 이 행에 기록한다(markCronSuccess / markCronStatus 'failed').
--
-- expected_freshness_hours=28: 일배치(04:00 KST)라 하루치 여유를 둔 다른 daily 소스와
-- 같은 기준. 실패가 아니라 '오래됨'만으로도 freshness check가 잡아낸다.
--
-- last_synced_at을 now()로 넣지 않는다 — 실제로 성공한 적이 없는 상태에서 최신인 척하면
-- 첫 점검을 무의미하게 만든다. NULL이면 freshness check가 'NEVER'로 잡는다.

INSERT INTO public.data_sources
  (id, cadence, expected_freshness_hours, last_synced_at, last_status, consecutive_failures, ui_label)
VALUES
  ('price-stats', 'daily', 28, NULL, NULL, 0, '단지 가격 파생값 집계 (평당가·30일 변동률·거래량·신고가)')
ON CONFLICT (id) DO UPDATE
  SET cadence                  = EXCLUDED.cadence,
      expected_freshness_hours = EXCLUDED.expected_freshness_hours,
      ui_label                 = EXCLUDED.ui_label;
