-- Phase 23: SEO URL 구조 최적화 — complexes.url_slug 컬럼 추가 + 초기 백필
-- 의존: public.complexes (20260430000002_complexes.sql 이후)
-- D-01: 한글 URL — si/gu/dong/canonical_name 그대로, 로마자 변환 없음
-- D-08: url_slug 사전 계산 — 이 마이그레이션이 초기 backfill 수행

-- ============================================================
-- 1. 컬럼 추가
-- ============================================================
ALTER TABLE public.complexes
  ADD COLUMN IF NOT EXISTS url_slug TEXT;

-- ============================================================
-- 2. UNIQUE INDEX (url_slug 기반 단지 조회 O(1) 보장)
--    Partial index: NULL 제외 (위치 없는 ~143개 단지는 기존 UUID URL 유지, D-09)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS complexes_url_slug_idx
  ON public.complexes(url_slug)
  WHERE url_slug IS NOT NULL;

-- ============================================================
-- 3. Backfill
--    D-02: 창원시(gu 있음) → 4단계 si/gu/dong/name
--          김해시(gu 없음) → 3단계 si/dong/name
--    D-09: si/dong=null 단지는 url_slug=NULL 유지
--    idempotent: url_slug IS NULL 조건으로 이미 채워진 행 건드리지 않음
-- ============================================================
UPDATE public.complexes
SET url_slug = CASE
  WHEN gu IS NOT NULL
    THEN si || '/' || gu || '/' || dong || '/' || canonical_name
  ELSE
    si || '/' || dong || '/' || canonical_name
END
WHERE si IS NOT NULL
  AND dong IS NOT NULL
  AND canonical_name IS NOT NULL
  AND url_slug IS NULL;

-- 결과 예상 (적용 후 확인):
--   SELECT COUNT(*) FROM complexes WHERE url_slug IS NOT NULL;  -- ~1706
--   SELECT COUNT(*) FROM complexes WHERE url_slug IS NULL;      -- ~143
--   SELECT COUNT(*) FROM complexes;                             -- ~1849
