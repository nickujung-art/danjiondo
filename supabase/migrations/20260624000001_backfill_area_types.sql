-- Phase 30: 미매핑 거래 321건 area_type_id 백필 재실행
-- assign_area_types()는 20260619000000에서 정의됨 (±2㎡ nearest match)
-- 용지아이파크 3건(2026-06 신규 ingest) 포함 전체 복구
SELECT assign_area_types();
