# Deferred Items — Phase 41 (busan-recollect)

## 1. `scripts/busan-status.ts` — 동일한 PostgREST 1,000행 캡이 `ingest_runs`·`transactions` 조회에도 잠재

**Found during:** 41-03 Task 2 (`complexes` 조회가 1,467건 중 1,000건에서 절단되는 것을 발견, 해당 부분만 `.range()` 페이지네이션으로 수정함 — 커밋은 41-03-SUMMARY.md 참조)

**Issue:** `collectMetrics()`의 `ingest_runs`(`source_id, status, rows_upserted` select)와 `transactions`(현재는 `head:true` count 라서 안전하지만 `deal_date` min/max 를 위한 `.select('deal_date').order().limit(1)`은 안전) 조회 중, `ingest_runs` select 는 `.range()` 없이 `.in('sgg_code', BUSAN_SGG_CODES)` 만 걸어 반환한다. 41-03 시점엔 부산 `ingest_runs` 가 0행(41-01이 purge)이라 이 캡에 걸리지 않지만, 41-05~07(MOLIT 백필)이 지역-월당 성공 레코드를 쌓으면(계획상 4,480 지역-월) 1,000행을 넘을 가능성이 높다.

**Why not fixed now:** 이 plan(41-03)의 파일 범위는 `scripts/seed-complexes.ts`이고, 이번 실행에서 실제로 절단이 관측·검증된 부분은 `complexes` 조회뿐이다(`ingest_runs`는 현재 0행이라 재현 불가 — 수정해도 이번 실행으로 검증할 방법이 없다). SCOPE BOUNDARY 원칙에 따라 이번 세션에서 직접 관측되지 않은 잠재 결함까지 선제 수정하지 않는다.

**Recommended action:** 41-05(또는 `ingest_runs`를 처음 대량으로 쌓는 plan)에서 `--assert-*` 게이트를 처음 부산 대상으로 돌리기 전에, 같은 `.range()` 페이지네이션 패턴을 `ingest_runs` select 에도 적용할 것. `complexes` 수정 커밋을 참고 패턴으로 삼을 것.

---

## ✅ 해소 (오케스트레이터, wave 2 마감) — 커밋 `e59c432`

`ingest_runs` select 에 `complexes` 와 동일한 `.range()` 페이지네이션을 적용했다.

**미룰 수 없다고 판단한 이유**: `ingest_runs_rows_upserted_sum` 은 41-05~07 수용 기준의
**근거 그 자체**다. 그리고 그룹 A 만으로 5개 구 x 140개월 x 2종 = **1,400 지역-월**이라
**첫 백필에서 바로 잘린다** — "재현 불가"가 아니라 "다음 plan 에서 반드시 재현된다".
잘린 합계는 적재량을 과소보고해 "워크플로는 성공인데 rows_upserted 와 transactions
증가분이 안 맞는다"는 오진을 만든다. 측정이 가장 중요한 순간에 측정이 거짓말하게 된다.

**`transactions` 조회는 손대지 않았다** — `head: true` count 와 `.limit(1)` 만 쓰므로
1,000행 캡에 걸리지 않는다는 41-03 의 판단이 맞다.

검증: `--assert-runs-purged` exit 0 / `--assert-seed-gate` exit 1(좌표 0% — 41-04 소관, 정상).
