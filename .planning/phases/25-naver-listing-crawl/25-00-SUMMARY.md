---
phase: 25-naver-listing-crawl
plan: "00"
subsystem: database
tags: [migration, schema, naver, listing]
dependency_graph:
  requires: []
  provides: [complexes.naver_complex_no]
  affects: [complexes, listing_prices]
tech_stack:
  added: []
  patterns: [partial-unique-index, nullable-foreign-id]
key_files:
  created:
    - supabase/migrations/20260617000001_phase25_naver_complex_no.sql
  modified: []
decisions:
  - "naver_complex_no는 TEXT NULLABLE로 추가 — NULL=미매핑, IS NOT NULL=크롤링 대상"
  - "UNIQUE INDEX에 WHERE naver_complex_no IS NOT NULL 조건으로 null 중복 허용"
  - "listing_prices write 정책 불필요 — service_role이 RLS bypass하므로 주석만 문서화"
metrics:
  duration: "5m"
  completed: "2026-06-17"
---

# Phase 25 Plan 00: naver_complex_no 마이그레이션 Summary

complexes 테이블에 naver_complex_no TEXT NULLABLE 컬럼을 추가하고, 중복 매핑 방지용 부분 유니크 인덱스를 설정했다.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | naver_complex_no 마이그레이션 작성 | 8772e05 | supabase/migrations/20260617000001_phase25_naver_complex_no.sql |
| 2 | supabase db push 실행 | — | checkpoint:human-action (미실행) |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — 마이그레이션은 DDL only, 새로운 네트워크 엔드포인트 없음.

## Self-Check: PASSED

- [x] supabase/migrations/20260617000001_phase25_naver_complex_no.sql 존재
- [x] naver_complex_no 키워드 7회 포함 (>= 3 기준 충족)
- [x] ALTER TABLE ... ADD COLUMN IF NOT EXISTS naver_complex_no TEXT 포함
- [x] UNIQUE INDEX WHERE naver_complex_no IS NOT NULL 포함
- [x] 커밋 8772e05 존재
