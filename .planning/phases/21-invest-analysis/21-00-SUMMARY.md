---
phase: "21"
plan: "00"
subsystem: db-migration
tags: [supabase, rpc, sql, redirect, next-config]
dependency_graph:
  requires: []
  provides: [invest_price_history-rpc, invest_regional_price_history-rpc, gap-analysis-redirect]
  affects: [21-02, 21-03]
tech_stack:
  added: []
  patterns: [supabase-rpc, nextjs-redirects, sql-group-by-aggregation]
key_files:
  created:
    - supabase/migrations/20260529000001_invest_price_history.sql
    - src/lib/data/invest.ts
  modified:
    - next.config.ts
decisions:
  - "invest_regional_price_history: transactions.sgg_code 직접 사용 → complexes JOIN 불필요 (성능 최적화)"
  - "area_m2 컬럼 사용 확정 (exclusive_area 없음) — 20260430000003_transactions.sql 직접 확인"
  - "supabase migration repair: 원격 DB에 이미 적용된 마이그레이션 버전 불일치 해결"
metrics:
  duration: "~6분 (359초)"
  completed_date: "2026-05-29"
  tasks_completed: 2
  files_changed: 3
requirements:
  - INVEST-01
  - INVEST-02
---

# Phase 21 Plan 00: DB 마이그레이션 + Redirect 설정 Summary

DB 마이그레이션으로 invest_price_history + invest_regional_price_history 두 RPC 함수를 생성하고, /gap-analysis → /invest 301 redirect를 next.config.ts에 추가.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | invest_price_history + invest_regional_price_history SQL 마이그레이션 | 4db70ca | supabase/migrations/20260529000001_invest_price_history.sql, src/lib/data/invest.ts |
| 2 | supabase db push + next.config.ts 301 redirect 추가 | 96f82cc | next.config.ts |

## Decisions Made

1. **complexes JOIN 제거**: `invest_regional_price_history`에서 `transactions.sgg_code` 컬럼이 직접 존재하므로 complexes JOIN 불필요. 계획에는 JOIN이 있었으나 실제 스키마 확인 후 더 효율적인 직접 쿼리로 작성.

2. **area_m2 컬럼 확정**: transactions 테이블 마이그레이션(20260430000003) 직접 확인. `area_m2 numeric(6,2)` 컬럼만 존재, `exclusive_area` 없음.

3. **supabase migration repair**: 원격 DB에 이미 적용된 마이그레이션이 로컬 히스토리와 불일치. 이미 적용된 버전들을 `repair --status applied`로 처리 후 최종 마이그레이션 성공 적용.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Enhancement] invest_regional_price_history에서 complexes JOIN 제거**
- **Found during:** Task 1
- **Issue:** 계획(PLAN.md)의 invest_regional_price_history SQL 예시는 `JOIN public.complexes c ON c.id = t.complex_id WHERE c.sgg_code = p_sgg_code`로 작성됨
- **Fix:** `transactions.sgg_code`가 직접 존재하므로 JOIN 불필요. `WHERE sgg_code = p_sgg_code`로 단순화
- **Files modified:** supabase/migrations/20260529000001_invest_price_history.sql
- **Benefit:** 불필요한 테이블 조인 제거로 쿼리 성능 향상

**2. [Rule 2 - Extra file] src/lib/data/invest.ts 추가 커밋**
- **Found during:** Task 1
- **Issue:** git status에서 `src/lib/data/invest.ts`가 이미 생성된 untracked 파일로 발견
- **Fix:** Task 1 커밋에 포함. 파일 내용은 RESEARCH.md의 코드 예시와 일치하며 RPC 호출 헬퍼 함수들 포함
- **Files modified:** src/lib/data/invest.ts

**3. [Rule 3 - Blocker] supabase migration repair 처리**
- **Found during:** Task 2
- **Issue:** `supabase db push` 실패 — 원격 DB에 이미 적용된 마이그레이션이 로컬 히스토리 테이블에 누락
- **Fix:** `npx supabase migration repair --status reverted/applied` 명령으로 히스토리 동기화 후 최종 마이그레이션 적용 성공
- **Commit:** 96f82cc (next.config.ts 커밋에 포함)

## Verification Results

```
# 마이그레이션 파일 검증
grep -c "invest_regional_price_history" supabase/migrations/20260529000001_invest_price_history.sql → 4
grep -c "invest_price_history" supabase/migrations/20260529000001_invest_price_history.sql → 4
grep -v "^--" ... | grep -c "cancel_date.*IS NULL" → 2
grep -c "GRANT EXECUTE" ... → 2

# redirect 확인
grep -c "gap-analysis" next.config.ts → 2
grep -c "permanent.*true" next.config.ts → 2
grep -c "withSentryConfig" next.config.ts → 2 (래퍼 구조 유지)

# 빌드 성공
npm run build → exit 0
```

## Known Stubs

없음. 이 플랜은 DB 마이그레이션과 redirect 설정만 포함하며, UI 구현은 Wave 2(21-02, 21-03)에서 처리.

## Threat Flags

없음. 신규 SQL RPC는 PostgREST prepared statement로 처리되며, 파라미터 검증은 호출 측(RSC)에서 allowlist로 처리됨 (T-21-01, T-21-02 — Wave 2에서 구현).

## Self-Check: PASSED

- [x] supabase/migrations/20260529000001_invest_price_history.sql 존재 확인
- [x] src/lib/data/invest.ts 존재 확인
- [x] next.config.ts gap-analysis redirect 존재 확인
- [x] 커밋 4db70ca 존재 확인
- [x] 커밋 96f82cc 존재 확인
