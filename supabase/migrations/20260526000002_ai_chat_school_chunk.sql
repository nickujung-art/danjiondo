-- complex_embeddings에 schools chunk_type 추가
ALTER TABLE complex_embeddings
  DROP CONSTRAINT IF EXISTS complex_embeddings_chunk_type_check;

ALTER TABLE complex_embeddings
  ADD CONSTRAINT complex_embeddings_chunk_type_check
  CHECK (chunk_type = ANY (ARRAY['summary','transactions','reviews','schools']));

-- 단지 좌표로 배정 학교 조회 RPC
CREATE OR REPLACE FUNCTION get_schools_for_point(p_lat float, p_lng float)
RETURNS TABLE(school_level text, school_name text)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT sds.school_level, sdsch.school_name
  FROM school_districts sds
  JOIN school_district_schools sdsch ON sdsch.district_id = sds.id
  WHERE ST_Within(ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326), sds.geometry)
  ORDER BY sds.school_level, sdsch.school_name;
$$;
