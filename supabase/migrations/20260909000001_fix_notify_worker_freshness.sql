-- ㉜-c notify-worker expected_freshness_hours 1h → 3h
-- GitHub Actions */5 스케줄 실측: 중앙값 42분, 최대 105분(1.75h).
-- 한도 1h 면 60분 초과 구간마다 가짜 경고가 뜬다.
UPDATE data_sources SET expected_freshness_hours = 3 WHERE id = 'notify-worker';
