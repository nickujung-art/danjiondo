---
phase: 20-gap-analysis
plan: "00"
subsystem: database
tags: [migration, gap-stats, rls, rpc]
dependency_graph:
  requires: [complexes table, transactions table, data_sources table]
  provides: [complex_gap_stats table, compute_gap_stats RPC]
  affects: [Wave 1 집계 cron, 갭투자 통계 페이지]
tech_stack:
  added: []
  patterns: [PERCENTILE_CONT ordered-set aggregate, UPSERT-safe UNIQUE, RLS public read]
key_files:
  created:
    - supabase/migrations/20260528000003_complex_gap_stats.sql
  modified: []
decisions:
  - "마이그레이션 파일명 20260528000001 → 20260528000003 변경: 001/002가 phase18_realtors·cron_data_sources에 이미 사용됨"
  - "compute_gap_stats는 STABLE (읽기 전용 집계) — SECURITY DEFINER 불필요, 서비스롤로만 호출"
  - "risk_level 컬럼은 테이블에 포함하되 compute_gap_stats 반환값에서는 제외 — cron UPSERT 시 애플리케이션 계층에서 분류"
metrics:
  duration: "5m"
  completed: "2026-05-28"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 20 Plan 00: complex_gap_stats DB 구조 마이그레이션 Summary

단지별 갭투자 통계를 저장하는 `complex_gap_stats` 테이블과 12개월 중위값 집계 RPC `compute_gap_stats()`를 마이그레이션으로 생성했다.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | complex_gap_stats 마이그레이션 SQL 작성 | 20d5f85 | supabase/migrations/20260528000003_complex_gap_stats.sql |

## What Was Built

마이그레이션 파일 `supabase/migrations/20260528000003_complex_gap_stats.sql` 하나로 아래 DB 구조를 전부 생성한다:

1. **complex_gap_stats 테이블** — 단지별 갭투자 통계 캐시
   - UNIQUE (complex_id) — UPSERT onConflict 대상
   - risk_level CHECK ('safe'|'caution'|'danger')
   - window_months DEFAULT 12

2. **인덱스 3개**
   - gap_ratio DESC (랭킹 페이지 정렬)
   - risk_level (위험도 필터)
   - complex_id (FK 조회)

3. **RLS** — gap_stats_public_read SELECT USING (true)

4. **compute_gap_stats(p_window_months integer DEFAULT 12)** SQL 함수
   - deal_type = 'sale' / 'jeonse' 엄격히 구분
   - PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) — OVER() 절 없음
   - cancel_date IS NULL AND superseded_by IS NULL 필터
   - complex_id IS NOT NULL 필터
   - sale_count >= 3 AND jeonse_count >= 3 희박 단지 제외

5. **data_sources** — 'gap-stats' row INSERT ON CONFLICT DO NOTHING

## Deviations from Plan

### Auto-resolved Issues

**1. [Rule 3 - Blocker] 마이그레이션 파일명 충돌**
- **Found during:** Task 1 시작 전 기존 마이그레이션 목록 확인
- **Issue:** 플랜에 명시된 `20260528000001_complex_gap_stats.sql`이 이미 `20260528000001_phase18_realtors.sql`로 사용 중
- **Fix:** `20260528000003_complex_gap_stats.sql`로 순번 조정
- **Files modified:** 파일명만 변경, SQL 내용 동일

## Checkpoint (사용자 액션 필요)

마이그레이션 파일 작성 완료. Wave 1 진행 전 반드시 DB에 적용해야 한다:

```bash
npm run db:push
# 또는
npx supabase db push
```

적용 후 검증:
```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'complex_gap_stats';
SELECT routine_name FROM information_schema.routines WHERE routine_name = 'compute_gap_stats';
```

## Known Stubs

없음 — SQL 마이그레이션 전용 플랜, UI 없음.

## Threat Flags

없음 — 계획된 위협 모델(T-20-01~03) 범위 내에서 구현 완료.

## Self-Check: PASSED

- [x] supabase/migrations/20260528000003_complex_gap_stats.sql 존재 확인
- [x] CREATE TABLE public.complex_gap_stats 포함 (grep count: 1)
- [x] compute_gap_stats 함수 포함 (grep count: 4)
- [x] gap_stats_public_read RLS 정책 포함 (grep count: 1)
- [x] 'gap-stats' data_sources INSERT 포함 (grep count: 1)
- [x] deal_type = 'sale' / deal_type = 'jeonse' 올바른 값 사용 확인
- [x] npm run lint 통과 (No ESLint warnings or errors, tsc --noEmit 통과)
- [x] 커밋 20d5f85 존재 확인
