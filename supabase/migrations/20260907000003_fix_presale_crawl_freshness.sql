-- ㉜-b presale-crawl expected_freshness_hours 96h → 144h
-- 화·목 스케줄의 최대 간격이 목→화 5일(120h)이므로 96h는 매주 월요일 오탐 발생
-- 144h = 120h + 24h 여유
UPDATE data_sources SET expected_freshness_hours = 144 WHERE id = 'presale-crawl';
