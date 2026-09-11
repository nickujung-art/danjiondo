-- ㊷ si/gu 결손 99곳 — kapt_code NULL → kapt-enrich 대상 밖 → si/gu 미채움
-- sgg_code → regions 테이블 결정적 매핑으로 채운다 (KAPT API 불필요)
-- 김해(48250)는 gu=NULL이 정상 — regions 테이블에 NULL로 저장돼 있음

UPDATE complexes c
SET
  si = r.si,
  gu = r.gu
FROM regions r
WHERE c.sgg_code = r.sgg_code
  AND c.si IS NULL
  AND c.status NOT IN ('demolished', 'merged')
  AND c.sgg_code IN ('48121','48123','48125','48127','48129','48250');
