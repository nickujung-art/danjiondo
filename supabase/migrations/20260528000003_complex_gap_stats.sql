-- complex_gap_stats: 단지별 갭투자 통계 캐시
-- daily-batch cron이 매일 04:00 KST에 compute_gap_stats() 결과로 UPSERT
-- 설계 원칙: regular table (RLS 적용 가능), UPSERT-safe UNIQUE, public read
-- Note: 마이그레이션 파일명은 20260528000003 (001/002는 phase18_realtors, cron_data_sources)

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. complex_gap_stats 테이블
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.complex_gap_stats (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id          uuid NOT NULL REFERENCES public.complexes(id) ON DELETE CASCADE,
  median_sale_price   bigint NOT NULL,       -- 매매가 중위값 (만원)
  median_jeonse_price bigint NOT NULL,       -- 전세보증금 중위값 (만원)
  gap_amount          bigint NOT NULL,       -- 갭 금액 = 매매가 - 전세가 (만원)
  gap_ratio           numeric(5,1) NOT NULL, -- 갭 비율 % (소수 1자리)
  jeonse_ratio        numeric(5,1) NOT NULL, -- 전세가율 % (= 100 - gap_ratio)
  risk_level          text NOT NULL CHECK (risk_level IN ('safe', 'caution', 'danger')),
  sale_count          integer NOT NULL,      -- 매매 거래 건수 (12개월)
  jeonse_count        integer NOT NULL,      -- 전세 거래 건수 (12개월)
  window_months       integer NOT NULL DEFAULT 12,
  computed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (complex_id)
);

COMMENT ON TABLE public.complex_gap_stats IS
  '단지별 갭투자 통계 캐시. daily-batch cron이 12개월 중위값으로 일 1회 UPSERT.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. 인덱스
-- ──────────────────────────────────────────────────────────────────────────────

-- 랭킹 페이지 정렬용 (갭 비율 내림차순)
CREATE INDEX complex_gap_stats_gap_ratio_idx
  ON public.complex_gap_stats (gap_ratio DESC);

-- 위험도 필터용
CREATE INDEX complex_gap_stats_risk_level_idx
  ON public.complex_gap_stats (risk_level);

-- FK 조회용
CREATE INDEX complex_gap_stats_complex_id_idx
  ON public.complex_gap_stats (complex_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.complex_gap_stats ENABLE ROW LEVEL SECURITY;

-- 갭투자 통계는 공개 부동산 정보 — anon key로 SELECT 허용
CREATE POLICY "gap_stats_public_read"
  ON public.complex_gap_stats FOR SELECT
  USING (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. compute_gap_stats SQL 함수
-- ──────────────────────────────────────────────────────────────────────────────
-- CRITICAL: PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY col) 만 사용 — OVER() 절 금지
-- CRITICAL: deal_type = 'sale' (매매), deal_type = 'jeonse' (전세) — 'trade'/'lease' 금지
-- CRITICAL: cancel_date IS NULL AND superseded_by IS NULL 필터 필수
-- CRITICAL: complex_id IS NOT NULL 필터 필수
-- sale_count >= 3 AND jeonse_count >= 3 조건으로 데이터 희박 단지 제외

CREATE OR REPLACE FUNCTION public.compute_gap_stats(
  p_window_months integer DEFAULT 12
)
RETURNS TABLE (
  complex_id          uuid,
  median_sale_price   bigint,
  median_jeonse_price bigint,
  gap_amount          bigint,
  gap_ratio           numeric,
  jeonse_ratio        numeric,
  sale_count          integer,
  jeonse_count        integer
)
LANGUAGE sql
STABLE
AS $$
  WITH sale_stats AS (
    SELECT
      complex_id,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS median_sale_price,
      COUNT(*)::integer AS sale_count
    FROM public.transactions
    WHERE
      deal_type = 'sale'
      AND deal_date >= CURRENT_DATE - (p_window_months || ' months')::interval
      AND cancel_date IS NULL
      AND superseded_by IS NULL
      AND complex_id IS NOT NULL
      AND price IS NOT NULL
    GROUP BY complex_id
  ),
  jeonse_stats AS (
    SELECT
      complex_id,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS median_jeonse_price,
      COUNT(*)::integer AS jeonse_count
    FROM public.transactions
    WHERE
      deal_type = 'jeonse'
      AND deal_date >= CURRENT_DATE - (p_window_months || ' months')::interval
      AND cancel_date IS NULL
      AND superseded_by IS NULL
      AND complex_id IS NOT NULL
      AND price IS NOT NULL
    GROUP BY complex_id
  )
  SELECT
    s.complex_id,
    s.median_sale_price::bigint,
    j.median_jeonse_price::bigint,
    (s.median_sale_price - j.median_jeonse_price)::bigint AS gap_amount,
    ROUND((1.0 - j.median_jeonse_price / s.median_sale_price) * 100, 1) AS gap_ratio,
    ROUND((j.median_jeonse_price / s.median_sale_price) * 100, 1) AS jeonse_ratio,
    s.sale_count,
    j.jeonse_count
  FROM sale_stats s
  JOIN jeonse_stats j ON s.complex_id = j.complex_id
  WHERE s.sale_count >= 3 AND j.jeonse_count >= 3;
$$;

COMMENT ON FUNCTION public.compute_gap_stats(integer) IS
  '매매·전세 중위값으로 단지별 갭투자 통계를 계산하는 집계 함수. '
  'daily-batch cron이 결과를 complex_gap_stats 테이블에 UPSERT한다. '
  'sale_count < 3 또는 jeonse_count < 3인 단지는 결과에서 제외.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. data_sources 등록
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO public.data_sources (id, cadence, expected_freshness_hours, ui_label)
VALUES ('gap-stats', 'daily', 28, '갭투자 통계 (일배치 재계산)')
ON CONFLICT (id) DO NOTHING;
