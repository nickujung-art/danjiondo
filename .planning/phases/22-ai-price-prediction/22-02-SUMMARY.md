---
phase: 22-ai-price-prediction
plan: "02"
subsystem: batch-worker
tags: [github-actions, batch, predictions, typescript, cron]

dependency_graph:
  requires:
    - phase: 22-ai-price-prediction
      plan: "00"
      provides: "complex_price_predictions 테이블, compute_predictions RPC, RLS 정책"
    - phase: 22-ai-price-prediction
      plan: "01"
      provides: "forecast() 함수 (src/lib/prediction/engine.ts)"
  provides:
    - "scripts/compute-predictions.ts — 전체 단지 × 4 area_bucket 예측 배치 스크립트"
    - ".github/workflows/compute-predictions.yml — 매일 KST 02:00 자동 실행 워크플로우"
  affects:
    - "22-03 (UI RSC): complex_price_predictions 데이터가 매일 최신화됨"

tech-stack:
  added: []
  patterns:
    - "GitHub Actions cron 배치 패턴 (KST 02:00 = UTC 17:00)"
    - "Promise.all() 버킷 병렬 + 단지 순차 처리 (연결 풀 보호)"
    - "에러 수집 후 일괄 process.exit(1) (GitHub Actions 실패 트리거)"

key-files:
  created:
    - "scripts/compute-predictions.ts"
    - ".github/workflows/compute-predictions.yml"
  modified: []

key-decisions:
  - "area_bucket 4개는 Promise.all() 병렬, 단지는 순차 — Supabase 연결 풀 보호와 처리 속도 균형"
  - "MIN_TX_COUNT=10 상수화 — D-02 요구사항 명시적 문서화"
  - "computed_at은 배치 시작 시점 단일 ISO 타임스탬프 — 같은 배치 실행의 모든 행이 동일한 시각을 가짐"

metrics:
  duration: "~15min"
  completed: "2026-05-29"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 22 Plan 02: GitHub Actions 배치 스크립트 Summary

**One-liner:** 전체 단지×4 area_bucket 예측을 매일 KST 02:00 자동 실행하는 TypeScript 배치 스크립트 + GitHub Actions 워크플로우

## Objective

Phase 22 Wave 2-A: compute_predictions RPC로 원천 데이터를 조회하고 forecast() 엔진으로 예측을 계산하여 complex_price_predictions 테이블에 upsert하는 일배치 시스템 구축. Vercel serverless 실행시간 제약을 우회하기 위해 GitHub Actions에서 실행.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | compute-predictions.ts 배치 스크립트 | 105cf90 | scripts/compute-predictions.ts |
| 2 | GitHub Actions 워크플로우 | a35577b | .github/workflows/compute-predictions.yml |

## What Was Built

### `scripts/compute-predictions.ts`

처리 흐름:

1. `createClient(URL, SERVICE_KEY)` — service_role 클라이언트 생성 (RLS bypass)
2. complexes 테이블 전체 ID 조회 (페이지네이션, 1,000건 단위)
3. 단지별 순차 반복:
   - AREA_BUCKETS = ['소형', '59', '84', '대형'] — Promise.all() 병렬
   - `compute_predictions(complex_id, area_bucket, 30)` RPC 호출
   - `rows.reduce(...)` 로 tx_count 합산 — 10건 미만 스킵 (D-02)
   - `forecast(pricePoints, 6)` 호출 — null 반환 시 스킵
   - `predicted_month: yearMonth + '-01'` 월 첫날 정규화
   - `complex_price_predictions.upsert(rows, { onConflict: 'complex_id,area_bucket,predicted_month' })`
4. 에러 수집 후 최종 요약 출력
5. `errors.length > 0` 이면 `process.exit(1)` — GitHub Actions 실패 알림

보안 처리:
- 환경변수 유효성 검사 (미설정 시 즉시 exit 1)
- console.log에 API 키/원본 데이터 출력 없음 (T-22-02-01 준수)

### `.github/workflows/compute-predictions.yml`

- **트리거:** `cron: '0 17 * * *'` (KST 02:00) + `workflow_dispatch`
- **환경:** ubuntu-latest, Node.js 22, npm cache
- **timeout-minutes: 30** — 2,000단지 × 4버킷 처리 여유
- **secrets:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **실행:** `npx tsx scripts/compute-predictions.ts`

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

없음 — 배치 스크립트와 워크플로우만 추가, UI 없음.

## Threat Surface Scan

신규 네트워크 엔드포인트 없음. GitHub Actions → Supabase 단방향 연결만 추가.

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information-disclosure | scripts/compute-predictions.ts | SUPABASE_SERVICE_ROLE_KEY는 process.env에서만 읽음; console.log 출력 없음 — T-22-02-01 mitigated |
| threat_flag: tampering | scripts/compute-predictions.ts | onConflict upsert로 중복 방지; service_role만 complex_price_predictions 쓰기 가능 (22-00 RLS) — T-22-02-02 mitigated |

## Self-Check: PASSED

- [x] `scripts/compute-predictions.ts` 존재
- [x] `.github/workflows/compute-predictions.yml` 존재
- [x] 커밋 105cf90 존재 (Task 1)
- [x] 커밋 a35577b 존재 (Task 2)
- [x] `SUPABASE_SERVICE_ROLE_KEY` 사용 확인
- [x] `onConflict: 'complex_id,area_bucket,predicted_month'` 확인
- [x] `tx_count` + `rows.reduce` D-02 스킵 로직 확인
- [x] `process.exit(1)` 에러 트리거 확인
- [x] `server-only` 임포트 없음 확인
- [x] `cron: '0 17 * * *'` (KST 02:00) 확인
- [x] `workflow_dispatch` 확인
- [x] `timeout-minutes: 30` 확인
- [x] compute-predictions.ts 타입 오류 없음 (tsc --noEmit 기존 오류와 무관)
