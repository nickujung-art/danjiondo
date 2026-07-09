-- D-11: 좌표+이름유사 중복 후보 탐지 (log-only, 병합 없음)
-- 기존 complexes.location(geography) + name_normalized(pg_trgm GIN) 인덱스 재사용
-- 호출은 좌표가 채워진 뒤(34-05 카카오 지오코딩 후)에만 유효 — KAPT 시딩 시점엔 좌표 없음
create or replace function find_nearby_similar_complexes(
  p_lat double precision,
  p_lng double precision,
  p_name_normalized text,
  p_exclude_kapt_code text,
  p_radius_m double precision,
  p_similarity_threshold real
) returns table(id uuid, canonical_name text, kapt_code text, dist_m double precision)
language sql stable as $$
  select c.id, c.canonical_name, c.kapt_code,
         ST_Distance(c.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as dist_m
  from complexes c
  where c.kapt_code is distinct from p_exclude_kapt_code
    and c.location is not null
    and ST_DWithin(c.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and similarity(c.name_normalized, p_name_normalized) > p_similarity_threshold
  order by dist_m;
$$;

comment on function find_nearby_similar_complexes is
  '좌표+이름유사 중복 Golden Record 후보 탐지 (log-only, 병합 없음). Phase 34-03에서 준비,
   34-05(카카오 지오코딩 후) detectPotentialDuplicate 헬퍼가 소비.';
