-- ㉞ regional_commentary 중복 행 수정
--
-- 원인: area_bucket이 항상 NULL인데, PostgreSQL UNIQUE 제약은 NULL을 서로 다른 값으로
-- 취급한다. 따라서 같은 (sgg_code, NULL, period_type, period_start) 조합이 여러 번
-- INSERT 되었다.
--
-- 수정:
--   1. 중복 행 중 generated_at이 가장 오래된 것을 삭제 (최신 생성분이 개선된 문구)
--   2. UNIQUE 제약에 NULLS NOT DISTINCT 추가 (PG 15+)

-- Step 1: 중복 행 정리 — 같은 (sgg_code, area_bucket, period_type, period_start) 그룹에서
--         generated_at이 최신이 아닌 행을 삭제
DELETE FROM regional_commentary
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY sgg_code, area_bucket, period_type, period_start
             ORDER BY generated_at DESC
           ) AS rn
    FROM regional_commentary
  ) ranked
  WHERE rn > 1
);

-- Step 2: 기존 제약 삭제 후 NULLS NOT DISTINCT로 재생성
ALTER TABLE regional_commentary
  DROP CONSTRAINT regional_commentary_unique;

ALTER TABLE regional_commentary
  ADD CONSTRAINT regional_commentary_unique
  UNIQUE NULLS NOT DISTINCT (sgg_code, area_bucket, period_type, period_start);
