-- Notify Worker 발화 주기 변경에 맞춘 freshness 문턱 조정 (2026-10-06)
--
-- 크론을 */5 → 일 1회(01:00 UTC)로 바꿨으므로 expected_freshness_hours도 맞춘다.
-- 기존 3시간은 실측 간격(중앙값 4시간)의 71%가 초과해 매일 오경보를 냈다.
-- 30시간 = 일 1회 + 여유 6시간. 이러면 진짜 중단만 빨강이 된다.

UPDATE public.data_sources
SET expected_freshness_hours = 30
WHERE id = 'notify-worker';
