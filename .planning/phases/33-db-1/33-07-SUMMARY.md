---
phase: 33-db-1
plan: "07"
type: execute
status: complete
completed_at: "2026-07-08"
---

# 33-07 Summary — 경남 신규 16개 시군구 국토부 실거래가 백필

## 결과

`molit-backfill-once.yml` workflow_dispatch를 여러 차례 트리거하여 완료. 최종 확인:

- 16개 신규 시군구 × (molit_trade + molit_villa_trade) × 120개월 = 4,080 combo 전부 `ingest_runs.status='success'` 기록됨
- 누적 249,574건 적재 (`transactions` 테이블)
- `status='failed'` 잔존 6건은 전부 이후 재실행에서 동일 (sgg_code, source_id, year_month) 조합이 `success`로 재기록된 stale artifact — `--resume` 재개 로직이 정상 동작했음을 확인, 실제 미완료 gap 아님

## Acceptance Criteria 검증

- [x] 경남 신규 16개 시군구의 10년치 국토부 실거래가(아파트+연립다세대)가 transactions에 적재됨
- [x] ingest_runs에서 16개 시군구 × 전체 기간 조합 모두 status='success' 존재 확인 (SQL로 직접 검증)

## Notes

- 트리거 자체는 05-00 phase의 `molit-backfill-once.yml`을 그대로 재사용 — 코드 변경 없음
- 완료까지 여러 날에 걸쳐 반복 재트리거 필요했음 (API 일 10,000회 한도로 인한 정상적인 분할 실행)
