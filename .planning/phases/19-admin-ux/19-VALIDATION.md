# Phase 19: 어드민 UI/UX 전면 개선 — Validation

**Phase:** 19-admin-ux
**Created:** 2026-05-27

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `vitest.config.ts` |
| Quick run (layout) | `npm run test -- --run src/__tests__/admin-layout.test.ts` |
| Quick run (filter) | `npm run test -- --run src/__tests__/admin-members-filter.test.ts` |
| Full suite | `npm run test` |
| Phase gate | `npm run lint && npm run build && npm run test` |

---

## Requirements → Test Map

| Req ID | Behavior | Test Type | File | Wave |
|--------|----------|-----------|------|------|
| ADMIN-10 | requireAdminLayout: 비로그인(user=null) → redirect('/login?next=/admin') | unit | admin-layout.test.ts | 0 |
| ADMIN-10 | requireAdminLayout: role='member' → redirect('/') | unit | admin-layout.test.ts | 0 |
| ADMIN-10 | requireAdminLayout: role='admin' → 통과 (redirect 미호출) | unit | admin-layout.test.ts | 0 |
| ADMIN-11 | members q='홍길동' → `.or('nickname.ilike.%홍길동%...')` 쿼리 포함 | unit | admin-members-filter.test.ts | 1 |
| ADMIN-11 | members role='admin' → `.eq('role', 'admin')` 쿼리 포함 | unit | admin-members-filter.test.ts | 1 |
| ADMIN-11 | members status='active' → `.is('suspended_at', null)` 포함 | unit | admin-members-filter.test.ts | 1 |
| ADMIN-11 | members status='suspended' → `.not('suspended_at', 'is', null)` 포함 | unit | admin-members-filter.test.ts | 1 |
| ADMIN-11 | members status='deleted' → `.not('deleted_at', 'is', null)` 포함 | unit | admin-members-filter.test.ts | 1 |
| ADMIN-11 | members q='' → `.or()` 조건 미추가 | unit | admin-members-filter.test.ts | 1 |
| ADMIN-11 | reports status='' → eq('status') 미추가 (전체 조회) | unit | admin-members-filter.test.ts | 1 |
| ADMIN-11 | reports status='pending' → `.eq('status', 'pending')` 포함 | unit | admin-members-filter.test.ts | 1 |
| ADMIN-12 | pending counts 3개 병렬 조회 (reports/ad_campaigns/gps) | unit | admin-layout.test.ts | 0 |
| ADMIN-13 | buildNavItems: pendingCount=150 → '99+' 뱃지 | unit | admin-layout.test.ts | 0 |
| ADMIN-13 | buildNavItems: pendingCount=0 → 뱃지 없음 | unit | admin-layout.test.ts | 0 |
| ADMIN-13 | buildNavItems: 9개 항목 반환 | unit | admin-layout.test.ts | 0 |

---

## Test Files

### `src/__tests__/admin-layout.test.ts` (ADMIN-10, ADMIN-12, ADMIN-13)

- **Wave:** 0 — 19-00 Task 1에서 생성
- **Covers:** requireAdminLayout auth guard (3 cases), pending count 조회, buildNavItems badge logic (3 cases)
- **Mock pattern:**
  ```typescript
  vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
  vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }))
  vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: vi.fn() }))
  ```

### `src/__tests__/admin-members-filter.test.ts` (ADMIN-11)

- **Wave:** 1 — 19-01 Task 1에서 생성 (Task 2에서 reports 케이스 추가)
- **Covers:** members query builder (6 cases), reports filter status (2 cases)
- **Mock pattern:**
  ```typescript
  vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: vi.fn() }))
  ```

---

## Sampling Rate

| Checkpoint | Command |
|-----------|---------|
| Per task commit | 해당 task 테스트 파일만 실행 |
| Per wave merge | `npm run test` (전체 suite) |
| Phase gate | `npm run lint && npm run build && npm run test` |

---

## Wave Coverage Summary

| Wave | Plan | Requirements | Test Files |
|------|------|-------------|------------|
| 0 | 19-00 | ADMIN-10, ADMIN-12, ADMIN-13 | admin-layout.test.ts |
| 1 | 19-01, 19-02 | ADMIN-11 | admin-members-filter.test.ts |

---

*Phase: 19-admin-ux*
*Validation doc created: 2026-05-27*
