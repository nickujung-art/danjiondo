-- 토월성원 4개 단지 좌표 수정 — 모두 동일 좌표(상남동 35.2175, 128.6920)에 겹쳐 있던 것을 분리
-- 좌표는 카카오맵 도로명주소 기준 근사치. 추후 국토부/카카오 로컬 API로 정밀 보정 가능
UPDATE complexes SET lat = 35.2190, lng = 128.6907
  WHERE id = '0f82624c-f290-4672-a7e3-272835596aab'; -- 성원토월1단지

UPDATE complexes SET lat = 35.2172, lng = 128.6900
  WHERE id = '7f5d84d2-365b-42ec-9825-001a4df4b3aa'; -- 성원아파트2단지

UPDATE complexes SET lat = 35.2160, lng = 128.6920
  WHERE id = '2de7fb27-2981-4871-a31d-337a5a3fd27f'; -- 토월성원3단지

UPDATE complexes SET lat = 35.2182, lng = 128.6935
  WHERE id = 'd8a97004-22ce-4b92-9a97-c03ec9cd35a7'; -- 성원5단지아파트
