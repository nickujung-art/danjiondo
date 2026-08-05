-- facility_kapt 중복 정리 + 관리비부과면적/면적구간별 세대수 컬럼 추가 (2026-08-05)
--
-- [중복 원인 — 실측]
-- 3,730행인데 단지는 1,732곳(단지당 2.15행)이었다. unique 제약 위반은 아니다 —
-- 제약이 (complex_id, data_month)라 data_month가 다르면 새 행이 정상적으로 생긴다.
-- 문제는 시설 정보가 **시계열이 아니라는 것**이다. 주차면수·승강기·동수·관리방식은
-- 거의 변하지 않는다. 실측: 오래된 행 1,998개 중 최신 행과 값이 다른 건 16개(0.8%)뿐이다.
--
-- 스냅샷이 매달 쌓인 건 kapt-facility-enrich.ts 가 실행 시각으로 data_month 를 만들기
-- 때문이다(`new Date(y, m, 1)`). 게다가 그 값이 로컬시(KST) 기준이라 UTC 로 저장되면서
-- 전월 말일이 되기도 했다 — 그래서 2026-04-30 과 2026-05-01 처럼 **같은 달 스냅샷이
-- 두 벌** 생겼다.
--
-- [왜 최신 행만 남기지 않고 컬럼별로 병합하나]
-- 최신 행을 그냥 남기면 손실이 난다. 실측으로 building_count 12건이 최신 행에서는 NULL
-- 인데 과거 행에는 값이 있었다. 컬럼마다 "가장 최근의 NULL 아닌 값"을 골라 합치면 손실 0.
--
-- [제약 변경]
-- 정리만 하면 다음 달 실행 때 또 쌓인다. unique 를 (complex_id) 로 좁혀 재발을 구조적으로
-- 막는다. data_month 는 시계열 키가 아니라 "마지막 수집 시점" 의미로 남긴다.

-- ── 1. 신규 컬럼 ────────────────────────────────────────────────────────────
-- 관리비는 법령상 관리비부과면적 비례로 부과된다. 이 값이 있어야 단지 총액을 평형별로
-- 쪼갤 수 있다(K-apt V4 getAphusBassInfoV4 의 kaptMarea).
ALTER TABLE facility_kapt
  ADD COLUMN IF NOT EXISTS mgmt_area          numeric,  -- kaptMarea, 관리비부과면적(㎡)
  ADD COLUMN IF NOT EXISTS households_60      integer,  -- kaptMparea60,  전용 60㎡ 이하 세대수
  ADD COLUMN IF NOT EXISTS households_85      integer,  -- kaptMparea85,  60~85㎡
  ADD COLUMN IF NOT EXISTS households_135     integer,  -- kaptMparea135, 85~135㎡
  ADD COLUMN IF NOT EXISTS households_over135 integer;  -- kaptMparea136, 135㎡ 초과

COMMENT ON COLUMN facility_kapt.mgmt_area IS
  'K-apt kaptMarea — 관리비부과면적(㎡). 관리비 평형별 배분의 분모.';
COMMENT ON COLUMN facility_kapt.data_month IS
  '마지막 수집 시점. 시계열 키가 아니다 — 단지당 1행만 유지된다(2026-08-05).';

-- ── 2. 컬럼별 최신 non-NULL 값으로 병합 ────────────────────────────────────
WITH newest AS (
  SELECT DISTINCT ON (complex_id) id, complex_id
  FROM facility_kapt
  ORDER BY complex_id, data_month DESC, id
),
merged AS (
  SELECT
    complex_id,
    (array_agg(parking_count      ORDER BY data_month DESC) FILTER (WHERE parking_count      IS NOT NULL))[1] AS parking_count,
    (array_agg(elevator_count     ORDER BY data_month DESC) FILTER (WHERE elevator_count     IS NOT NULL))[1] AS elevator_count,
    (array_agg(building_count     ORDER BY data_month DESC) FILTER (WHERE building_count     IS NOT NULL))[1] AS building_count,
    (array_agg(management_type    ORDER BY data_month DESC) FILTER (WHERE management_type    IS NOT NULL))[1] AS management_type,
    (array_agg(heat_type          ORDER BY data_month DESC) FILTER (WHERE heat_type          IS NOT NULL))[1] AS heat_type,
    (array_agg(total_area         ORDER BY data_month DESC) FILTER (WHERE total_area         IS NOT NULL))[1] AS total_area,
    (array_agg(management_cost_m2 ORDER BY data_month DESC) FILTER (WHERE management_cost_m2 IS NOT NULL))[1] AS management_cost_m2,
    (array_agg(kapt_code          ORDER BY data_month DESC) FILTER (WHERE kapt_code          IS NOT NULL))[1] AS kapt_code
  FROM facility_kapt
  GROUP BY complex_id
)
UPDATE facility_kapt f
SET parking_count      = m.parking_count,
    elevator_count     = m.elevator_count,
    building_count     = m.building_count,
    management_type    = m.management_type,
    heat_type          = m.heat_type,
    total_area         = m.total_area,
    management_cost_m2 = m.management_cost_m2,
    kapt_code          = m.kapt_code,
    updated_at         = now()
FROM newest n
JOIN merged m ON m.complex_id = n.complex_id
WHERE f.id = n.id;

-- ── 3. 병합하고 남은 과거 행 삭제 ──────────────────────────────────────────
DELETE FROM facility_kapt f
WHERE f.id NOT IN (
  SELECT DISTINCT ON (complex_id) id
  FROM facility_kapt
  ORDER BY complex_id, data_month DESC, id
);

-- ── 4. 단지당 1행을 제약으로 고정 ──────────────────────────────────────────
ALTER TABLE facility_kapt DROP CONSTRAINT IF EXISTS facility_kapt_complex_id_data_month_key;
DROP INDEX IF EXISTS facility_kapt_complex_id_data_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS facility_kapt_complex_id_key
  ON facility_kapt (complex_id);
