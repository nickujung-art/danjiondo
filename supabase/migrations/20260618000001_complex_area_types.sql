-- Phase: complex_area_types
-- 네이버 부동산 평형 기준으로 단지별 공식 평형 목록을 저장
-- transactions.area_m2(국토부)는 호실마다 미세하게 달라서
-- exclusiveArea(네이버 공식)를 canonical 기준으로 삼아 ±2㎡ 매칭

-- ── 1. 단지별 평형 목록 ────────────────────────────────────────────────────────
CREATE TABLE complex_area_types (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id         UUID         NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
  naver_pyeong_no    INTEGER      NOT NULL,               -- Naver pyeongNo
  pyeong_name        TEXT         NOT NULL,               -- "34A", "34B", "25"
  supply_area_m2     NUMERIC(8,2),                        -- 공급면적 (㎡)
  exclusive_area_m2  NUMERIC(8,2) NOT NULL,               -- 전용면적 (㎡) — 매칭 기준
  exclusive_pyeong   NUMERIC(6,2),                        -- 전용면적 (평)
  created_at         TIMESTAMPTZ  DEFAULT now(),
  UNIQUE (complex_id, naver_pyeong_no)
);

CREATE INDEX idx_cat_complex_id ON complex_area_types(complex_id);
CREATE INDEX idx_cat_exclusive_area ON complex_area_types(exclusive_area_m2);

COMMENT ON TABLE complex_area_types IS
  '네이버 부동산 공식 평형 목록. transactions.area_type_id FK로 연결.';
COMMENT ON COLUMN complex_area_types.exclusive_area_m2 IS
  '전용면적(㎡). transactions.area_m2와 ±2㎡ 범위로 매칭.';

-- ── 2. transactions에 area_type_id 컬럼 추가 ──────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN area_type_id UUID REFERENCES complex_area_types(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_area_type_id ON transactions(area_type_id);

COMMENT ON COLUMN transactions.area_type_id IS
  '네이버 평형 기준 canonical 타입. NULL이면 네이버 미매핑 단지이거나 ±2㎡ 이내 매칭 없음.';
