---
phase: 21-invest-analysis
plan: "03"
subsystem: complex-detail-price-chart
tags: [rsc, searchparams, recharts, dynamic-import, use-client-fix]
dependency_graph:
  requires: [21-01]
  provides: [complex-detail-price-chart-section]
  affects: []
tech_stack:
  added: []
  patterns: [rsc-searchparams, use-client-wrapper, dynamic-ssr-false, allowlist-validation]
key_files:
  created: []
  modified:
    - src/app/complexes/[id]/page.tsx
    - src/components/invest/ComplexPriceChartWrapper.tsx
    - src/components/invest/RegionalPriceChartWrapper.tsx
decisions:
  - "searchParams Props 추가: area_type을 ALLOWED_AREA_BUCKETS allowlist로 검증, 미포함 값은 undefined (전체 조회)"
  - "Promise.all에 getComplexAreaTypes + getComplexPriceByType 마지막에 추가 — 기존 변수 순서 유지"
  - "[Rule 1] ComplexPriceChartWrapper + RegionalPriceChartWrapper에 'use client' 추가 — Next.js 15에서 ssr:false dynamic()은 클라이언트 컴포넌트 필수"
metrics:
  duration: "~7분"
  completed: "2026-05-29"
  tasks_completed: 1
  tasks_total: 1
  files_created: 0
  files_modified: 3
---

# Phase 21 Plan 03: 단지 상세 페이지 시세 차트 섹션 Summary

**One-liner:** `/complexes/[id]` 페이지에 URL searchParam 타입 탭 + ComplexPriceChartWrapper 기반 시세 흐름 섹션 추가 (ALLOWED_AREA_BUCKETS allowlist 검증 + 법적 면책 문구 포함)

## What Was Built

Wave 2-B: 기존 단지 상세 페이지(`src/app/complexes/[id]/page.tsx`)에 시세 흐름 차트 섹션을 추가했다.

### Task 1: 단지 상세 페이지 시세 차트 섹션 추가

- `Props`에 `searchParams: Promise<{ area_type?: string }>` 추가
- `ALLOWED_AREA_BUCKETS` allowlist로 `area_type` 검증 — 미포함 값은 `undefined` (전체 조회)
- `Promise.all`에 `getComplexAreaTypes` + `getComplexPriceByType` 두 쿼리 추가 (기존 변수 순서 유지)
- `GapAnalysisCard` 아래에 시세 흐름 카드 섹션 삽입:
  - 타입 탭: `href="/complexes/${id}?area_type=${bucket}"` 형식 (URL-driven, JS 불필요)
  - 전체 탭: `href="/complexes/${id}"` (area_type 없음)
  - `ComplexPriceChartWrapper` props: `data={priceHistory} title={...}`
  - 법적 면책 문구: "실거래 흐름 기반 참고 지수입니다. 투자 결정에 직접 활용하지 마세요."
- `revalidate = 86400` 유지
- 기존 `getComplexGapStats`, `GapAnalysisCard`, 모든 기존 쿼리 보존

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | `60998c0` | feat(21-03): 단지 상세 페이지 시세 흐름 차트 섹션 추가 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ComplexPriceChartWrapper + RegionalPriceChartWrapper에 `'use client'` 추가**

- **발견 시점:** Task 1 빌드 단계
- **문제:** `ssr: false`가 있는 `next/dynamic()`은 Next.js 15에서 Server Component에서 사용 불가. 두 Wrapper 파일 모두 `'use client'` 지시어가 누락되어 빌드 오류 발생
- **오류 메시지:** `` `ssr: false` is not allowed with `next/dynamic` in Server Components. Please move it into a Client Component. ``
- **수정:** `ComplexPriceChartWrapper.tsx`와 `RegionalPriceChartWrapper.tsx` 상단에 `'use client'` 추가
- **영향:** 두 Wrapper가 클라이언트 컴포넌트로 명시됨 — RSC(`page.tsx`)에서 여전히 import 가능 (RSC는 클라이언트 컴포넌트를 import할 수 있음)
- **파일 수정:** `src/components/invest/ComplexPriceChartWrapper.tsx`, `src/components/invest/RegionalPriceChartWrapper.tsx`
- **커밋:** `60998c0` (Task 1 커밋에 포함)

## Verification

```
✓ grep -c "ComplexPriceChartWrapper" page.tsx → 2 (import 1 + 사용 1)
✓ grep -c "getComplexAreaTypes" page.tsx → 2 (import 1 + 호출 1)
✓ grep -c "getComplexPriceByType" page.tsx → 2 (import 1 + 호출 1)
✓ grep -c "revalidate = 86400" page.tsx → 1 (기존 유지)
✓ grep -c "getComplexGapStats" page.tsx → 2 (기존 import + 호출 보존)
✓ grep -c "투자 결정에 직접 활용하지 마세요" page.tsx → 1
✓ 'use client' 없음 in page.tsx (RSC 유지)
✓ backdrop-blur / gradient-text / glow 없음 (AI 슬롭 금지 준수)
✓ npm run lint 통과 (ESLint + TypeScript 오류 없음)
✓ npm run build 통과 (29.7s 컴파일 성공)
✓ 테스트 실패: 전부 기존 ECONNREFUSED 127.0.0.1:54321 (로컬 Supabase 미실행) — 이번 변경사항 무관
```

## Known Stubs

없음 — 모든 데이터는 실제 DB 쿼리(`getComplexAreaTypes`, `getComplexPriceByType`)에서 받아 렌더링한다.

## Threat Flags

없음 — T-21-10 (area_type allowlist 검증) ALLOWED_AREA_BUCKETS allowlist로 mitigate 완료.

## Self-Check: PASSED

- `src/app/complexes/[id]/page.tsx` — FOUND (수정됨)
- `src/components/invest/ComplexPriceChartWrapper.tsx` — FOUND (수정됨)
- `src/components/invest/RegionalPriceChartWrapper.tsx` — FOUND (수정됨)
- commit `60998c0` — FOUND (feat(21-03): 단지 상세 페이지 시세 흐름 차트 섹션 추가)
