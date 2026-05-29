---
phase: 21-invest-analysis
plan: "01"
subsystem: invest-data-charts
tags: [recharts, server-only, area-chart, dynamic-import, ssr-false]
dependency_graph:
  requires: [21-00]
  provides: [invest-data-functions, invest-chart-components]
  affects: [21-02, 21-03]
tech_stack:
  added: []
  patterns: [server-only, dynamic-ssr-false, recharts-area-chart, linear-gradient-color]
key_files:
  created:
    - src/lib/data/invest.ts
    - src/components/invest/RegionalPriceChart.tsx
    - src/components/invest/RegionalPriceChartWrapper.tsx
    - src/components/invest/ComplexPriceChart.tsx
    - src/components/invest/ComplexPriceChartWrapper.tsx
  modified: []
decisions:
  - "invest.ts는 21-00 에이전트가 미리 작성했으므로 Task 1은 확인 후 그대로 유지"
  - "차트 색상 결정: 24개월 첫값 대비 마지막값 기준 단일 색상 (#16a34a 상승 / #dc2626 하락)"
  - "fmtPrice 로컬 함수 사용 (server-only import 금지 우회)"
metrics:
  duration: "~15분"
  completed: "2026-05-29"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 0
---

# Phase 21 Plan 01: 데이터 레이어 + 차트 컴포넌트 Summary

**One-liner:** server-only `invest.ts` 데이터 함수 3종 + Recharts AreaChart 기반 컬러 영역 차트 4파일 (dynamic ssr:false 래퍼 패턴)

## What Was Built

Wave 1-B: 데이터 레이어와 차트 컴포넌트를 분리 구현. Wave 2 (21-02, 21-03)가 이 파일들을 import해 사용한다.

### Task 1: src/lib/data/invest.ts

- `import 'server-only'`로 클라이언트 번들에서 완전 제외
- `getRegionalPriceHistory(supabase, sggCode, areaBucket, months)` — `invest_regional_price_history` RPC 호출
- `getComplexAreaTypes(supabase, complexId, months)` — `transactions` 직접 쿼리, `area_m2` 기준 버킷화, `cancel_date IS NULL AND superseded_by IS NULL` 필터 포함
- `getComplexPriceByType(supabase, complexId, areaBucket, months)` — `invest_price_history` RPC 호출
- 모든 함수 오류 시 빈 배열 반환 (throw 없음)

> 참고: invest.ts는 21-00 에이전트가 Wave 0에서 이미 작성했고 커밋(`4db70ca`)되어 있었다. 내용이 동일하여 중복 커밋 없이 확인 후 Task 2로 진행했다.

### Task 2: 차트 컴포넌트 4파일

| 파일 | 역할 | 특이사항 |
|------|------|----------|
| `RegionalPriceChart.tsx` | `'use client'` AreaChart (지역 단위) | linearGradient 동적 색상 |
| `RegionalPriceChartWrapper.tsx` | `dynamic(ssr:false)` 래퍼 | 서버 컴포넌트, `'use client'` 없음 |
| `ComplexPriceChart.tsx` | `'use client'` AreaChart (단지 단위) | gradId 접두어 `complexPriceGrad-` |
| `ComplexPriceChartWrapper.tsx` | `dynamic(ssr:false)` 래퍼 | 서버 컴포넌트, `'use client'` 없음 |

차트 색상: `isRising = last >= first` (24개월 첫값 대비 마지막값) → `#16a34a` (상승) / `#dc2626` (하락)

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 (확인) | `4db70ca` | feat(21-00): invest_price_history + invest_regional_price_history SQL 마이그레이션 |
| Task 2 | `041699b` | feat(21-01): Recharts AreaChart 차트 컴포넌트 4파일 작성 |

## Deviations from Plan

### 참고사항: invest.ts 선행 커밋

- **발견:** Task 1 실행 시 `src/lib/data/invest.ts`가 이미 `4db70ca` 커밋에 포함되어 있었음
- **원인:** Wave 1 병렬 실행 중 21-00 에이전트가 동일 파일을 미리 작성
- **처리:** 내용이 플랜과 동일하므로 중복 작성 없이 확인 후 Task 2 진행 (Rule 3: 이미 완료된 작업 재작업 불필요)
- **영향:** 없음

그 외 편차 없음. 플랜 그대로 실행.

## Verification

```
✓ src/lib/data/invest.ts — 'server-only' 지시어, 3개 함수 export
✓ RegionalPriceChart.tsx — 'use client', AreaChart, linearGradient #16a34a/#dc2626
✓ RegionalPriceChartWrapper.tsx — ssr:false, 'use client' 없음
✓ ComplexPriceChart.tsx — 'use client', AreaChart, linearGradient #16a34a/#dc2626
✓ ComplexPriceChartWrapper.tsx — ssr:false, 'use client' 없음
✓ AI 슬롭 없음 (backdrop-blur/gradient-text/glow/violet/indigo/purple 없음)
✓ npm run build 통과 (컴파일 성공, 타입 오류 없음)
```

## Known Stubs

없음 — 모든 컴포넌트는 실제 props 데이터를 받아 렌더링한다. 빈 데이터 처리는 "데이터가 부족합니다" 메시지로 처리.

## Threat Flags

없음 — 이 플랜은 서버 전용 데이터 함수와 클라이언트 차트 렌더링만 다룬다. 새로운 네트워크 엔드포인트나 인증 경로 없음.

## Self-Check: PASSED

- `src/lib/data/invest.ts` — FOUND
- `src/components/invest/RegionalPriceChart.tsx` — FOUND
- `src/components/invest/RegionalPriceChartWrapper.tsx` — FOUND
- `src/components/invest/ComplexPriceChart.tsx` — FOUND
- `src/components/invest/ComplexPriceChartWrapper.tsx` — FOUND
- commit `041699b` — FOUND (feat(21-01): Recharts AreaChart 차트 컴포넌트 4파일)
