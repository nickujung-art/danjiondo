-- 평형(area_type) 매칭 애매성 방지
--
-- 문제: 같은 단지 안에 전용면적이 2㎡ 이내로 붙어있는 평형(A/B 타입 등)이 흔함
-- (예: 35A=84.38㎡, 35B=84.10㎡ — 0.28㎡ 차이). 국토부 실거래가는 정확한 면적만
-- 제공하고 타입명을 안 주기 때문에, 기존 "±2㎡ 이내 최근접" 로직은 후보 간
-- 거리 차이가 작을 때(예: 84.24㎡ 거래) 사실상 추측으로 A/B를 결정하고 있었음.
--
-- 실측 결과(2026-07-07): 이미 배정된 거래 181,892건 중 64,990건(36%)이
-- 1등/2등 후보 거리 차이 0.3㎡ 미만 — 상당수가 잘못된 타입으로 배정됐을 수 있음.
--
-- 해결: 1등 후보가 2등 후보보다 최소 0.3㎡ 이상 더 가까울 때만 배정.
-- 애매하면 area_type_id를 NULL로 남김 — UI(area-groups.ts extractTypedAreaGroups)가
-- 이미 NULL을 "정수 m² 칩(예: 84㎡)"으로 안전하게 폴백 처리하므로 화면 깨짐 없음.

CREATE OR REPLACE FUNCTION assign_area_types()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH ranked AS (
    SELECT
      t.id AS tx_id,
      cat.id AS cat_id,
      ABS(cat.exclusive_area_m2 - t.area_m2) AS dist,
      ROW_NUMBER() OVER (
        PARTITION BY t.id
        ORDER BY ABS(cat.exclusive_area_m2 - t.area_m2), cat.naver_pyeong_no NULLS LAST, cat.id
      ) AS rn
    FROM transactions t
    JOIN complex_area_types cat ON cat.complex_id = t.complex_id
    WHERE t.area_type_id IS NULL
      AND t.cancel_date IS NULL
      AND t.superseded_by IS NULL
      AND ABS(cat.exclusive_area_m2 - t.area_m2) <= 2.0
  ),
  first_choice  AS (SELECT tx_id, cat_id, dist FROM ranked WHERE rn = 1),
  second_choice AS (SELECT tx_id, dist        FROM ranked WHERE rn = 2)
  UPDATE transactions t
  SET area_type_id = f.cat_id
  FROM first_choice f
  LEFT JOIN second_choice s ON s.tx_id = f.tx_id
  WHERE f.tx_id = t.id
    AND (s.dist IS NULL OR (s.dist - f.dist) >= 0.3);
$$;

COMMENT ON FUNCTION assign_area_types IS
  '미매핑 거래를 complex_area_types에 연결. ±2㎡ 이내 최근접이되, 2등 후보와 차이가
   0.3㎡ 미만이면(애매) 배정 보류 — area_type_id NULL 유지.';

CREATE OR REPLACE FUNCTION public.auto_assign_area_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  best_id     uuid;
  best_dist   numeric;
  second_dist numeric;
BEGIN
  IF NEW.area_type_id IS NULL AND NEW.cancel_date IS NULL THEN
    SELECT cat.id, ABS(cat.exclusive_area_m2 - NEW.area_m2)
      INTO best_id, best_dist
    FROM public.complex_area_types cat
    WHERE cat.complex_id = NEW.complex_id
      AND ABS(cat.exclusive_area_m2 - NEW.area_m2) <= 2.0
    ORDER BY ABS(cat.exclusive_area_m2 - NEW.area_m2), cat.naver_pyeong_no NULLS LAST, cat.id
    LIMIT 1;

    IF best_id IS NOT NULL THEN
      SELECT ABS(cat.exclusive_area_m2 - NEW.area_m2)
        INTO second_dist
      FROM public.complex_area_types cat
      WHERE cat.complex_id = NEW.complex_id
        AND cat.id != best_id
        AND ABS(cat.exclusive_area_m2 - NEW.area_m2) <= 2.0
      ORDER BY ABS(cat.exclusive_area_m2 - NEW.area_m2)
      LIMIT 1;

      IF second_dist IS NULL OR (second_dist - best_dist) >= 0.3 THEN
        NEW.area_type_id := best_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_assign_area_type IS
  '신규 거래 INSERT 시 complex_area_types와 ±2㎡ nearest match로 area_type_id 자동
   설정. 2등 후보와 거리 차이가 0.3㎡ 미만(애매)이면 배정 보류.';

-- 기존에 배정된 거래 중, 새 기준으로는 애매해서 배정하지 않았을 건들을 재평가하여
-- NULL로 되돌림 (오분류된 A/B 라벨을 화면에 계속 보여주는 것보다 안전)
WITH assigned AS (
  SELECT
    t.id AS tx_id,
    t.area_type_id AS current_cat_id,
    ABS(cat.exclusive_area_m2 - t.area_m2) AS current_dist
  FROM transactions t
  JOIN complex_area_types cat ON cat.id = t.area_type_id
  WHERE t.area_type_id IS NOT NULL
),
runner_up AS (
  SELECT
    a.tx_id,
    MIN(ABS(cat2.exclusive_area_m2 - t2.area_m2)) AS second_dist
  FROM assigned a
  JOIN transactions t2 ON t2.id = a.tx_id
  JOIN complex_area_types cat2
    ON cat2.complex_id = t2.complex_id
   AND cat2.id != a.current_cat_id
   AND ABS(cat2.exclusive_area_m2 - t2.area_m2) <= 2.0
  GROUP BY a.tx_id
)
UPDATE transactions t
SET area_type_id = NULL
FROM assigned a
LEFT JOIN runner_up r ON r.tx_id = a.tx_id
WHERE t.id = a.tx_id
  AND r.second_dist IS NOT NULL
  AND (r.second_dist - a.current_dist) < 0.3;
