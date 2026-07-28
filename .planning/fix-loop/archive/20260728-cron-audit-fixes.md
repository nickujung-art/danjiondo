# 활성 수정 — 크론 전수조사에서 발견된 2건 (Chronos AI 배치 타임아웃 / 갭투자 통계 RPC 타임아웃)

## 문제 정의

### #1 Chronos AI 가격예측 배치 (`compute-predictions-ai.yml`, 매일 03:00 KST)
- 6일 연속(07-22~07-27) `timeout-minutes: 60` 초과로 취소됨 (`gh run view`로 "exceeded the
  maximum execution time" 확인)
- 원인: `scripts/compute-predictions-ai.py`가 단지×버킷 조합(현재 활성 단지 4,156개 ×
  5버킷 = 20,780조합)을 **순차적으로 1건씩** `compute_predictions` RPC 네트워크 호출로
  조회한다. 대부분(~90%)은 최소 데이터 임계값 미달로 스킵되지만, 그 판단 자체도 매번
  왕복 호출이 필요해 스킵되는 조합만으로도 네트워크 왕복시간 합이 60분 예산을 거의
  다 먹는다.
- 처리 순서가 고정(정렬 조건 없음, PostgREST 기본 순서)이라 매일 같은 앞쪽 단지들만
  갱신되고 뒤쪽은 방치됨 — 실측: 활성 단지 4,156개 중 Chronos 예측 보유 1,785개(43%),
  그중 1,030개(58%)가 7일 이상 stale.

### #2 갭투자 통계 (`compute_gap_stats()` RPC, Vercel `/api/cron/daily` 내부, 매일 04:00 KST)
- 5일 연속 실패 (`data_sources.gap-stats: failed, consecutive_failures=5`)
- 재현: `EXPLAIN ANALYZE select * from compute_gap_stats(12)` 실행시간 **6.67초**,
  PostgREST가 쓰는 `authenticator` 롤의 `statement_timeout`이 **8초** — 여유가 거의 없어
  일배치 내 다른 단계(K-apt·분양·청약홈·오피스텔 수집)와 동시에 DB 부하가 걸리면
  8초를 넘겨 `57014 canceling statement due to statement timeout` 발생.
- 근본 원인: `transactions_deal_date_idx`가 `deal_date` 단일 컬럼이라 `deal_type` 필터를
  인덱스에서 못 거르고, 힙 단계에서 8~10만 건을 리체크하다 6.5초가 그 자리에서 소모됨
  (EXPLAIN ANALYZE의 "Bitmap Heap Scan on transactions" 단계).
- `complex_gap_stats` 테이블이 2026-07-25 이후 갱신 중단 상태(3일 stale).

## 수정 범위 (파일 목록)

1. `scripts/compute-predictions-ai.py` — 네트워크 조회 병렬화 + 우선순위 정렬
2. `.github/workflows/compute-predictions-ai.yml` — `timeout-minutes: 60` → `90` (안전 여유)
3. `supabase/migrations/20260728120000_transactions_dealtype_date_idx.sql` (신규) —
   `transactions(deal_type, deal_date desc) where cancel_date is null and superseded_by
  is null` 부분 복합 인덱스 추가

## 해결 접근법

### #1
- `select_paginated()`에 `extra_params` 지원 추가 (order/filter 전달용)
- 신규 `fetch_last_updated()`: `complex_price_predictions`에서
  `model_name=eq.chronos-bolt-small` 최신 `computed_at`을 단지별로 조회 → 미갱신·오래된
  단지가 앞에 오도록 `complex_ids` 정렬
- `process_bucket()`을 `fetch_history()`(RPC 조회 + 임계값 체크, I/O 바운드)와
  `run_inference()`(Chronos 모델 호출, CPU 바운드, 로직 변경 없음)로 분리
- Stage 1: `ThreadPoolExecutor(max_workers=16)`로 전체 조합의 `fetch_history()`를 병렬
  실행 (I/O 바운드라 GIL 영향 적음) → 임계값 통과한 조합만 수집
- Stage 2: Stage 1에서 통과한 조합만 기존과 동일하게 순차 모델 추론 (torch 파이프라인
  스레드 공유 안 함, 안전). 우선순위 정렬 순서 유지하도록 재정렬 후 처리
- 모델 추론 로직(`predict_quantiles` 호출부) 자체는 **한 글자도 변경하지 않음** — 순서
  재구성과 fetch 병렬화만 적용, 예측 결과가 달라질 위험 없음
- workflow yml의 `timeout-minutes`를 60→90으로 상향해 안전 여유 추가(주 수정이 아니라
  보조 안전장치)
- (검증 반영) `fetch_history()`는 스레드별 `requests.Session()`(threading.local)을
  재사용 — 매 호출마다 새 TCP/TLS 핸드셰이크 여는 현재 방식 그대로 두면 병렬화 효과가
  줄어듦
- (검증 반영) `ThreadPoolExecutor`의 각 future는 `as_completed()` 루프 안에서 개별
  try/except로 감싸 예외를 그 자리에서 처리 — 한 조합의 예외가 전체 루프를 죽이지
  않도록 하고 기존 `errors` 카운팅 의미를 보존
- (검증 반영) `fetch_last_updated()`는 단지별 개별 조회가 아니라 `complex_price_predictions`
  전체를 `model_name=eq.chronos-bolt-small` 필터로 페이지네이션 조회한 뒤 클라이언트에서
  단지별 최신 `computed_at`으로 축약 — 왕복 1회(페이지네이션 포함)로 제한
- (검증 반영) Stage 2는 우선순위 정렬 순서를 유지하도록 Stage 1 결과를 combo id 기준으로
  재정렬 후 진입(`as_completed()` 완료 순서에 의존하지 않음)
- (검증 반영) Stage 2 추론 루프에 소프트 데드라인(예: 시작 후 80분 경과 시 남은 pending
  upsert만 flush하고 정상 종료) 추가 — Stage 1이 빨라져도 Stage 2(추론) 자체가 예산을
  넘길 가능성을 코드리뷰가 지적, 하드킬 대신 우아한 조기 종료로 방어

### #2
- `transactions(deal_type, deal_date desc) where cancel_date is null and superseded_by
  is null` 인덱스 추가 — **(검증 반영) `CREATE INDEX CONCURRENTLY`로 변경**. 기존
  `transactions` 인덱스들은 테이블 생성과 같은 마이그레이션에서(빈 테이블 상태로)
  만들어져 락 리스크가 없었지만, 이번엔 83만 행 규모의 라이브 프로덕션 테이블(실시간
  조회 + 일배치 쓰기)에 추가하는 것이라 plain `CREATE INDEX`의 ACCESS EXCLUSIVE 락이
  사이트 전역에 영향을 줄 수 있음 — CONCURRENTLY로 락 없이 빌드
- RPC/애플리케이션 코드는 무변경 — 인덱스만으로 6.67초→1초 미만 예상(EXPLAIN 결과의
  "Bitmap Heap Scan" 6.5초 구간이 인덱스 스캔으로 대체되어 사라질 것으로 판단)
- 마이그레이션 적용 후 `EXPLAIN ANALYZE`로 실행시간 재확인, 8초 미만(여유 있게 3초
  이하) 확인되면 완료로 판단

## 예상 변경 사항

- `compute-predictions-ai.py`: 함수 분리(`fetch_history`/`run_inference`) + 병렬 fetch
  stage + 우선순위 정렬. 외부 인터페이스(환경변수, DB 스키마) 무변경
- `compute-predictions-ai.yml`: 1줄 (`timeout-minutes: 60` → `90`)
- 신규 마이그레이션 파일 1개 (인덱스만, 기존 데이터/RLS/함수 무변경)

## 검증 방법

- #1: 로컬에 Python(torch/chronos) 실행 환경 없음 — 문법·로직은 코드 리뷰로 검증하고,
  실제 동작 확인은 병합 후 `gh workflow run compute-predictions-ai.yml`로 수동 트리거해
  `gh run watch`로 관찰(스킵률·처리 속도·에러율 로그 확인)
- #2: `mcp__supabase__execute_sql`로 마이그레이션 적용 직후 `EXPLAIN ANALYZE`
  재실행해 8초 미만 확인. 이후 다음 04:00 KST 배치에서 `data_sources.gap-stats` 상태
  전환 확인(수 시간 뒤 재확인 필요)

## 루프 카운터: 0
