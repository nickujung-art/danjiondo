-- cron 잡별 최신 실행 상태 추적 — data_sources에 신규 job 등록
INSERT INTO data_sources (id, cadence, expected_freshness_hours, ui_label) VALUES
  ('daily-batch',   'daily',  28, 'Vercel 일배치 (K-apt / 분양권 / 청약홈 / 오피스텔)'),
  ('cafe-articles', 'daily',  28, '카페 아티클 수집 (Naver)'),
  ('notify-worker', 'daily',   1, '알림 워커 (GitHub Actions 5분 인터벌)')
ON CONFLICT (id) DO NOTHING;
