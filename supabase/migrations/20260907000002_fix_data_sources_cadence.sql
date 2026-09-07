-- ㉜ data_sources cadence 수정
--
-- regional-commentary: 매주 일 21:00 UTC → weekly (monthly 아님)
-- presale-crawl: 화·목 주2회 → weekly (가장 가까운 값), freshness 96h (4일)
--
-- CHECK 제약에 'weekly' 추가 필요

-- Step 1: CHECK 제약 확장
ALTER TABLE data_sources DROP CONSTRAINT data_sources_cadence_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_cadence_check
  CHECK (cadence IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual', 'event', 'manual'));

-- Step 2: cadence + freshness 수정
UPDATE data_sources
SET cadence = 'weekly', expected_freshness_hours = 200
WHERE id = 'regional-commentary';

UPDATE data_sources
SET cadence = 'weekly', expected_freshness_hours = 96
WHERE id = 'presale-crawl';
