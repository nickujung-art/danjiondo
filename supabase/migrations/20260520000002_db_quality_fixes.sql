-- DB 품질 수정: 임대 태깅, 토월성원 통합, 마린애시앙부영 재매칭, 경동메르빌 해소

-- ══════════════════════════════════════════════
-- 1. 영구임대 단지 rental 태깅
-- ══════════════════════════════════════════════
UPDATE complexes SET status = 'rental'
WHERE id IN (
  '16e8757d-24ab-4a4f-bbfd-147a950c421c',  -- 구산영구임대
  'd457aee3-384d-4836-a201-3e9ec4c4e169'   -- 중리영구임대
);

-- ══════════════════════════════════════════════
-- 2. 토월성원 4단지 → 1단지 통합
--    대표: 7f5d84d2 (성원아파트2단지, 551 tx)
-- ══════════════════════════════════════════════
UPDATE complexes
SET canonical_name  = '토월성원아파트',
    household_count = 6252
WHERE id = '7f5d84d2-365b-42ec-9825-001a4df4b3aa';

-- 대표와 POI 중복되는 비대표 POI 먼저 삭제
DELETE FROM facility_poi fp
WHERE fp.complex_id IN (
  '0f82624c-f290-4672-a7e3-272835596aab',
  '2de7fb27-2981-4871-a31d-337a5a3fd27f',
  'd8a97004-22ce-4b92-9a97-c03ec9cd35a7'
)
AND EXISTS (
  SELECT 1 FROM facility_poi fp2
  WHERE fp2.complex_id = '7f5d84d2-365b-42ec-9825-001a4df4b3aa'
    AND fp2.category = fp.category
    AND fp2.poi_name = fp.poi_name
);

-- 남은 비대표 POI → 대표 단지로 이전
UPDATE facility_poi
SET complex_id = '7f5d84d2-365b-42ec-9825-001a4df4b3aa'
WHERE complex_id IN (
  '0f82624c-f290-4672-a7e3-272835596aab',
  '2de7fb27-2981-4871-a31d-337a5a3fd27f',
  'd8a97004-22ce-4b92-9a97-c03ec9cd35a7'
);

-- facility_kapt: 비대표 삭제 (동일 data_month unique 충돌)
DELETE FROM facility_kapt
WHERE complex_id IN (
  '0f82624c-f290-4672-a7e3-272835596aab',
  '2de7fb27-2981-4871-a31d-337a5a3fd27f',
  'd8a97004-22ce-4b92-9a97-c03ec9cd35a7'
);

-- 비대표 3개 → merged 처리
UPDATE complexes
SET status       = 'merged',
    successor_id = '7f5d84d2-365b-42ec-9825-001a4df4b3aa'
WHERE id IN (
  '0f82624c-f290-4672-a7e3-272835596aab',
  '2de7fb27-2981-4871-a31d-337a5a3fd27f',
  'd8a97004-22ce-4b92-9a97-c03ec9cd35a7'
);

-- 4개 단지 이름 alias → 대표 단지
INSERT INTO complex_aliases (id, complex_id, source, alias_name, confidence)
VALUES
  (gen_random_uuid(), '7f5d84d2-365b-42ec-9825-001a4df4b3aa', 'manual', '토월성원아파트',   1.0),
  (gen_random_uuid(), '7f5d84d2-365b-42ec-9825-001a4df4b3aa', 'manual', '성원아파트2단지', 1.0),
  (gen_random_uuid(), '7f5d84d2-365b-42ec-9825-001a4df4b3aa', 'manual', '토월성원2단지',   1.0),
  (gen_random_uuid(), '7f5d84d2-365b-42ec-9825-001a4df4b3aa', 'manual', '성원토월1단지',   1.0),
  (gen_random_uuid(), '7f5d84d2-365b-42ec-9825-001a4df4b3aa', 'manual', '토월성원3단지',   1.0),
  (gen_random_uuid(), '7f5d84d2-365b-42ec-9825-001a4df4b3aa', 'manual', '성원5단지아파트', 1.0)
ON CONFLICT (complex_id, source, alias_name) DO NOTHING;

-- ══════════════════════════════════════════════
-- 3. 마린애시앙부영 재매칭
--    마산가포 사랑으로 부영아파트(4bbc672a) → 월영마린애시앙(2c97176e)
-- ══════════════════════════════════════════════
UPDATE transactions
SET complex_id = '2c97176e-ba03-47cd-9441-d17af491fb6c'
WHERE raw_complex_name = '마린애시앙부영'
  AND complex_id = '4bbc672a-e82c-4c2c-8c27-79638de38c17';

INSERT INTO complex_aliases (id, complex_id, source, alias_name, confidence)
VALUES (gen_random_uuid(), '2c97176e-ba03-47cd-9441-d17af491fb6c', 'manual', '마린애시앙부영', 1.0)
ON CONFLICT (complex_id, source, alias_name) DO NOTHING;

-- ══════════════════════════════════════════════
-- 4. 경동메르빌 미매칭 해소 (48125 = 마산합포구)
-- ══════════════════════════════════════════════
UPDATE transactions
SET complex_id = '77de93f8-ec49-40c4-9faf-f4c5d0b73109'
WHERE raw_complex_name = '경동메르빌'
  AND complex_id IS NULL
  AND raw_region_code = '48125';

UPDATE transactions
SET complex_id = '76c9d31a-77bc-4a52-9279-c4c38197259f'
WHERE raw_complex_name = '경동메르빌2차'
  AND complex_id IS NULL
  AND raw_region_code = '48125';

INSERT INTO complex_aliases (id, complex_id, source, alias_name, confidence)
VALUES
  (gen_random_uuid(), '77de93f8-ec49-40c4-9faf-f4c5d0b73109', 'manual', '경동메르빌',    1.0),
  (gen_random_uuid(), '77de93f8-ec49-40c4-9faf-f4c5d0b73109', 'manual', '월포경동메르빌', 1.0)
ON CONFLICT (complex_id, source, alias_name) DO NOTHING;
