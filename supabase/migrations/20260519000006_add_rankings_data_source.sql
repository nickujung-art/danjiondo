INSERT INTO data_sources (id, cadence, expected_freshness_hours, ui_label)
VALUES ('rankings', 'daily', 24, '단지 랭킹')
ON CONFLICT (id) DO NOTHING;
