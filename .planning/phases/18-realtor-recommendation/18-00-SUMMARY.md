---
phase: 18-realtor-recommendation
plan: "00"
subsystem: database
tags: [migration, rls, schema, typescript]
dependency_graph:
  requires: []
  provides: [realtors-table, realtor_assignments-table, database-types]
  affects: [18-01, 18-02, 18-03]
tech_stack:
  added: []
  patterns: [RLS, FK-CASCADE, UNIQUE-constraint, updated_at-trigger]
key_files:
  created:
    - supabase/migrations/20260528000001_phase18_realtors.sql
  modified:
    - src/types/database.ts
decisions:
  - "UNIQUE(complex_id, display_order) 제약으로 단지당 최대 2명 배정을 DB 레벨에서 강제"
  - "is_active 필터는 앱 레벨(Wave 1)에서 처리 — 공개 SELECT 정책은 전체 행 허용"
  - "어드민 쓰기 정책은 이중 방어용 — Server Action은 createSupabaseAdminClient()로 RLS 우회"
  - "supabase db query --linked --file 로 SQL 직접 실행 (db push 미사용)"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-05-26"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 18 Plan 00: DB 마이그레이션 — realtors + realtor_assignments 테이블 신설 Summary

공인중개사 추천 섹션을 위한 DB 스키마를 Supabase production에 적용하고 TypeScript 타입 정의를 업데이트했다.

## What Was Built

### Task 1: 마이그레이션 SQL 파일 작성 및 Supabase 적용

- `supabase/migrations/20260528000001_phase18_realtors.sql` 생성
- `supabase db query --linked --file` 명령으로 production DB에 직접 적용 (`db push` 미사용)
- 두 테이블 생성 확인, 4개 RLS 정책 확인, UNIQUE 제약 확인

**realtors 테이블:**
- 공인중개사 마스터 레코드 (name, agency_name, phone, description, license_no, image_url, is_active)
- `set_updated_at()` 트리거 재사용 (기존 함수)
- RLS: 공개 SELECT + 어드민 ALL

**realtor_assignments 테이블:**
- 단지-공인중개사 배정 (realtor_id FK, complex_id FK, display_order 1 또는 2)
- `UNIQUE(complex_id, display_order)` — 단지당 최대 2개 슬롯, 각 순서당 1명
- `CHECK (display_order IN (1, 2))` — 유효 값 제한
- 양방향 인덱스 (complex_id, realtor_id)
- RLS: 공개 SELECT + 어드민 ALL

### Task 2: database.ts 타입 블록 추가

`src/types/database.ts`의 `public.Tables` 객체에 두 테이블 타입 블록 추가:
- `realtors`: Row/Insert/Update (agency_name 필드명 일치)
- `realtor_assignments`: Row/Insert/Update + Relationships (realtors FK, complexes FK)

## Verification

```sql
-- 테이블 존재 확인
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('realtors', 'realtor_assignments');
-- 결과: realtor_assignments, realtors (2행)

-- RLS 정책 확인
SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('realtors', 'realtor_assignments');
-- 결과: 4개 정책 (select_all × 2, admin_write × 2)

-- UNIQUE 제약 확인
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.realtor_assignments'::regclass AND contype = 'u';
-- 결과: realtor_assignments_complex_id_display_order_key
```

Lint: ESLint "No warnings or errors". TypeScript: database.ts 관련 오류 없음.

## Deviations from Plan

None - plan executed exactly as written.

The only note: `supabase db query --linked --file` was used instead of the Supabase MCP `apply_migration` tool, as the MCP tool was not directly callable via bash. This achieves the same result — SQL executed against the remote project without using `db push`.

## Threat Model Coverage

| Threat | Mitigation Status |
|--------|-------------------|
| T-18-00-01: Tampering via duplicate assignments | MITIGATED — UNIQUE(complex_id, display_order) applied |
| T-18-00-02: Elevation of privilege (write) | MITIGATED — admin-only RLS write policy applied |
| T-18-00-03: is_active=false disclosure | DEFERRED — app-level filter to be implemented in Wave 1 (18-01) |

## Threat Flags

None — no new network endpoints or auth paths introduced. Migration is DDL-only.

## Known Stubs

None — this plan creates DB schema only; no UI or data stubs.

## Self-Check: PASSED

- [x] `supabase/migrations/20260528000001_phase18_realtors.sql` exists
- [x] `realtors` table exists in Supabase production
- [x] `realtor_assignments` table exists in Supabase production
- [x] UNIQUE(complex_id, display_order) constraint exists
- [x] 4 RLS policies applied
- [x] `src/types/database.ts` contains `realtors:` and `realtor_assignments:` blocks
- [x] Commit 2523828 exists
