-- Phase 22: AI 가격 예측
-- complex_price_predictions: 단지별 타입별 예측값 저장 테이블
-- compute_predictions RPC: 배치 스크립트에서 원천 데이터 조회용 (STABLE)
-- 참고: cancel_date IS NULL AND superseded_by IS NULL 항상 포함 (취소·정정 제외)
-- 참고: complexes.id UUID, transactions.complex_id UUID, deal_type enum

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. complex_price_predictions 테이블
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.complex_price_predictions (
  id                    uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  complex_id            uuid          NOT NULL REFERENCES public.complexes(id) ON DELETE CASCADE,
  area_bucket           text          NOT NULL CHECK (area_bucket IN ('소형', '59', '84', '대형')),
  predicted_month       date          NOT NULL,  -- 월 첫날 정규화: '2026-07-01'
  predicted_price_mean  integer       NOT NULL,  -- 만원
  predicted_price_lower integer,                -- 80% CI 하한
  predicted_price_upper integer,                -- 80% CI 상한
  model_name            text          NOT NULL CHECK (model_name IN ('holt-winters', 'double-exp', 'linear', 'insufficient-data')),
  training_mape         real,                   -- 마지막 6개월 hold-out MAPE (0.0~1.0)
  training_count        integer,                -- 학습에 사용된 월 수
  ai_commentary         text,                   -- Claude Haiku 한국어 해설 (숫자 없음)
  ai_cached_at          timestamptz,            -- 해설 캐시 시각
  computed_at           timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (complex_id, area_bucket, predicted_month)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. RLS 정책
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.complex_price_predictions ENABLE ROW LEVEL SECURITY;

-- anon + authenticated: SELECT 허용
CREATE POLICY "read_predictions" ON public.complex_price_predictions
  FOR SELECT USING (true);

-- 쓰기는 service_role이 RLS bypass하므로 별도 정책 불필요

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. 인덱스
-- ──────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_predictions_complex_month
  ON public.complex_price_predictions (complex_id, area_bucket, predicted_month);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. compute_predictions RPC
-- 배치 스크립트에서 단지·타입별 월별 평균 실거래가를 조회하는 함수
-- STABLE: 같은 TX 내 동일 파라미터 결과 동일 보장
-- SECURITY DEFINER 사용 금지: 읽기 전용, 호출자 권한으로 충분
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_predictions(
  p_complex_id  uuid,
  p_area_bucket text,
  p_months      int DEFAULT 30
)
RETURNS TABLE (year_month text, avg_price numeric, tx_count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT
    to_char(deal_date, 'YYYY-MM') AS year_month,
    ROUND(AVG(price))             AS avg_price,
    COUNT(*)                      AS tx_count
  FROM public.transactions
  WHERE
    complex_id    = p_complex_id
    AND deal_type = 'sale'::public.deal_type
    AND deal_date >= (CURRENT_DATE - (p_months || ' months')::interval)::date
    AND cancel_date   IS NULL
    AND superseded_by IS NULL
    AND CASE
          WHEN area_m2 < 50 THEN '소형'
          WHEN area_m2 < 66 THEN '59'
          WHEN area_m2 < 95 THEN '84'
          ELSE '대형'
        END = p_area_bucket
  GROUP BY to_char(deal_date, 'YYYY-MM')
  HAVING COUNT(*) >= 1  -- 배치 스크립트에서 10건 미만 필터링 (D-02)
  ORDER BY year_month ASC
$$;

GRANT EXECUTE ON FUNCTION public.compute_predictions(uuid, text, int)
  TO authenticated, anon;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. GRANT
-- ──────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.complex_price_predictions TO authenticated, anon;
GRANT ALL   ON public.complex_price_predictions TO service_role;
