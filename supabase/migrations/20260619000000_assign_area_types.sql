-- assign_area_types(): 미매핑 거래를 complex_area_types에 연결
-- 전용면적 ±2.0m² nearest match (동일 면적 A/B는 naver_pyeong_no로 deterministic 처리)
CREATE OR REPLACE FUNCTION assign_area_types()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE transactions t
  SET area_type_id = (
    SELECT cat.id
    FROM complex_area_types cat
    WHERE cat.complex_id = t.complex_id
      AND ABS(cat.exclusive_area_m2 - t.area_m2) <= 2.0
    ORDER BY
      ABS(cat.exclusive_area_m2 - t.area_m2),  -- 전용면적 가장 근접
      cat.naver_pyeong_no NULLS LAST,           -- pyeongNo 오름차순 (A < B — deterministic)
      cat.id
    LIMIT 1
  )
  WHERE t.area_type_id IS NULL
    AND t.cancel_date IS NULL
    AND t.superseded_by IS NULL
    AND EXISTS (
      SELECT 1 FROM complex_area_types WHERE complex_id = t.complex_id
    );
$$;
