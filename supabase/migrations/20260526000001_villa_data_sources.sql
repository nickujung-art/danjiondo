-- 연립다세대 실거래가 파이프라인 data_sources 등록
INSERT INTO data_sources (id, cadence, expected_freshness_hours, ui_label) VALUES
  ('molit_villa_trade', 'monthly', 720, '국토부 연립다세대 실거래가 (매매)'),
  ('molit_villa_rent',  'monthly', 720, '국토부 연립다세대 실거래가 (전월세)')
ON CONFLICT (id) DO NOTHING;
