---
phase: 21-invest-analysis
plan: "02"
subsystem: invest-page
tags: [rsc, isr, recharts, gap-analysis, invest, url-state]
dependency_graph:
  requires: [21-00, 21-01]
  provides: [invest-page]
  affects: [21-03]
tech_stack:
  added: []
  patterns: [rsc-isr, url-driven-filter, parallel-fetch, readonly-client]
key_files:
  created:
    - src/app/invest/page.tsx
  modified: []
decisions:
  - "/invest 페이지 ISR revalidate=3600 + createReadonlyClient() — cookies() 없이 revalidate 보장"
  - "formatPrice import from @/lib/format (로컬 복사 금지 준수)"
  - "AREA_OPTIONS 3개 (전체|59㎡|84㎡) — D-03/D-09 결정 준수, 입력검증은 ALLOWED_AREA_BUCKETS 4값"
  - "Promise.all로 priceHistory + rows 병렬 fetch"
  - "gap-analysis 301 redirect는 next.config.ts에 Wave 0(21-00)에서 이미 설정됨"
metrics:
  duration: "~10분"
  completed: "2026-05-29"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 21 Plan 02: /invest 통합 RSC 페이지 Summary

**One-liner:** `/invest` ISR RSC 페이지 — 지역별 시세 차트 + 갭투자 랭킹 테이블 통합, URL searchParam 3종 필터 (sgg_code|area_type|risk_level)

## What Was Built

Wave 2-A: 기존 `/gap-analysis/page.tsx` 패턴을 베이스로 시세 차트 섹션을 추가한 `/invest` 통합 투자 분석 RSC 페이지.

### Task 1: src/app/invest/page.tsx

**필수 패턴 확인:**
- `export const revalidate = 3600` — ISR 1시간 캐싱
- `createReadonlyClient()` — cookies() 없음, revalidate 정상 동작 보장 (T-21-09)
- `import { formatPrice } from '@/lib/format'` — 로컬 복사 없음

**페이지 구조:**
- 상단: 지역 필터 탭 (전체 + 6구) + 시세 흐름 차트 카드
  - 타입 탭 D-03/D-09: 전체|59㎡|84㎡ 정확히 3개 고정
  - `RegionalPriceChartWrapper` — data + title props 전달
  - 법적 면책 문구 ("투자 결정에 직접 활용하지 마세요")
- 하단: 갭투자 랭킹 섹션
  - 위험도 필터 탭 (전체|안전|주의|위험)
  - 단지명 클릭 → `/complexes/${row.complexId}` (D-06)
  - 빈 상태 처리 ("일배치 cron이 실행된 후 데이터가 표시됩니다")

**보안 (Threat Model 준수):**
- T-21-06: `ALLOWED_AREA_BUCKETS` allowlist 검증 (4값 — 소형/59/84/대형); 미포함 → undefined
- T-21-07: `ALLOWED_SGG_CODES` import from invest.ts로 검증
- T-21-08: `ALLOWED_RISK_LEVELS` allowlist + getGapRankings 내부 이중 방어
- T-21-09: `createReadonlyClient()` — cookies() 없음

**URL 필터 상태:**
- `sgg_code` (지역): 전체 → undefined, 특정 구 → 해당 code
- `area_type` (타입): 전체 → undefined, '59'/'84' → AreaBucket
- `risk_level` (위험도): 전체 → undefined, safe/caution/danger
- `filterTab()` 헬퍼: 3개 파라미터를 유지하면서 특정 key만 변경하는 URL 생성

**/gap-analysis redirect:**
- `next.config.ts`에 Wave 0(21-00)에서 이미 설정됨
  - `/gap-analysis` → `/invest` (permanent: true, 301)
  - `/gap-analysis/:path*` → `/invest/:path*`

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | `72f7ef5` | feat(21-02): /invest 투자 분석 통합 RSC 페이지 |

## Deviations from Plan

### 참고사항: /gap-analysis redirect 선행 설정

- **발견:** `next.config.ts`에 `/gap-analysis` → `/invest` 301 redirect가 이미 존재
- **원인:** Wave 0(21-00) 에이전트가 선행 작업
- **처리:** 중복 설정 없이 그대로 사용 (내용 동일)
- **영향:** 없음

그 외 편차 없음. 플랜 그대로 실행.

## Verification

```
✓ src/app/invest/page.tsx — 존재
✓ revalidate = 3600 — 1건
✓ createReadonlyClient() — 1건
✓ 투자 결정에 직접 활용하지 마세요 — 1건
✓ RegionalPriceChartWrapper — 2건 (import + 사용)
✓ getGapRankings — 2건 (import + 사용)
✓ getRegionalPriceHistory — 2건 (import + 사용)
✓ formatPrice — import만 (로컬 정의 없음)
✓ 'use client' — 없음 (RSC 유지)
✓ AREA_OPTIONS — 3개 (전체|59㎡|84㎡)
✓ 소형/대형 — AREA_OPTIONS에 없음 (검증용 ALLOWED_AREA_BUCKETS에만)
✓ /complexes/${row.complexId} — 2건
✓ backdrop-blur/gradient-text/glow — 없음 (AI 슬롭 없음)
✓ npm run build — PASSED (/invest 1.69kB, /gap-analysis 353B redirect)
✓ ESLint — No warnings or errors
```

## Known Stubs

없음 — 모든 데이터는 실제 Supabase RPC를 통해 조회된다. 빈 데이터 시 적절한 빈 상태 UI가 표시된다.

## Threat Flags

없음 — 새로운 네트워크 엔드포인트 없음. 모든 searchParam은 allowlist 검증 후 쿼리에 전달됨.

## Self-Check: PASSED

- `src/app/invest/page.tsx` — FOUND
- commit `72f7ef5` — FOUND (feat(21-02): /invest 투자 분석 통합 RSC 페이지)
