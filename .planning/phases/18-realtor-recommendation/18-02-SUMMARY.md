---
phase: 18-realtor-recommendation
plan: "02"
subsystem: admin-ui
tags: [admin, realtor, crud, server-actions, next15]
dependency_graph:
  requires:
    - 18-01 (realtors table, realtor-actions.ts, realtors.ts)
  provides:
    - /admin/realtors list page
    - /admin/realtors/new create page
    - /admin/realtors/[id]/edit edit+assignment page
  affects:
    - admin navigation
    - realtor_assignments table (via Server Actions)
tech_stack:
  added: []
  patterns:
    - RSC auth guard (createSupabaseServerClient + profiles.role check)
    - createSupabaseAdminClient for RLS bypass in admin pages
    - Next.js 15 async params pattern
    - Optimistic UI update for assignment list
key_files:
  created:
    - src/app/admin/realtors/page.tsx
    - src/app/admin/realtors/new/page.tsx
    - src/app/admin/realtors/[id]/edit/page.tsx
    - src/components/admin/RealtorActions.tsx
    - src/components/admin/RealtorCreateForm.tsx
    - src/components/admin/RealtorEditForm.tsx
  modified: []
decisions:
  - Used `.limit(5000)` for complexes query in edit page (DB has ~670 complexes, plan specified 5000)
  - AssignmentWithComplex type defined inline in RealtorEditForm to match getAssignmentsByRealtor return type with nested complexes
  - Status badge uses border+background styling instead of solid fill (matches existing admin UI conventions)
  - Assignment name display prefers nested complexes.canonical_name (from JOIN), falls back to complexes array lookup
metrics:
  duration: "~15 minutes"
  completed: "2026-05-26"
  tasks_completed: 2
  files_created: 6
---

# Phase 18 Plan 02: Admin CRUD UI Summary

RSC admin pages + client components for managing realtors at `/admin/realtors` with inline complex assignment UI.

## Completed Tasks

### Task 1: List page + RealtorActions client component

- `src/app/admin/realtors/page.tsx`: RSC list page with `revalidate=0`, auth guard redirecting unauthenticated users to `/login?next=/admin/realtors`, admin role check redirecting to `/`, `createSupabaseAdminClient()` for RLS bypass. Table columns: 이름 (link to edit) | 사무소명 | 전화번호 | 자격번호 | 상태 | 액션. Empty state: "등록된 공인중개사가 없습니다." Status badge shows 활성/비활성 with green/gray styling. "+ 새 중개사 등록" button with `var(--dj-orange)` background.

- `src/components/admin/RealtorActions.tsx`: `'use client'` component with `useTransition`, calls `deleteRealtor` Server Action. Confirm dialog warns about cascade deletion of assignments. Props include `isActive` (declared but not used for UI — structure matches plan spec).

### Task 2: Create/edit pages + form components

- `src/app/admin/realtors/new/page.tsx`: RSC page with same auth guard pattern, renders `<RealtorCreateForm />`.

- `src/components/admin/RealtorCreateForm.tsx`: `'use client'` form component. Fields: name (required), agency_name (required), phone required/type="tel", description (textarea optional), license_no (optional), image_url (type="url" optional). On submit calls `createRealtor(formData)`, on success `router.push('/admin/realtors')`. Follows `AdCreateForm.tsx` Field helper + inputStyle/labelStyle pattern.

- `src/app/admin/realtors/[id]/edit/page.tsx`: RSC page with Next.js 15 `params: Promise<{ id: string }>` pattern. Parallel fetches `getRealtorById` + `getAssignmentsByRealtor` via `adminClient`. Loads complexes with `.limit(5000)` filtered to `active` and `in_redevelopment` status. Passes all data to `<RealtorEditForm />`.

- `src/components/admin/RealtorEditForm.tsx`: `'use client'` with two sections:
  - Section 1: Edit basic info (name, agency_name, phone, description, license_no, image_url, is_active select). Calls `updateRealtor(id, formData)` on submit.
  - Section 2: Assignment UI with text search input filtering complexes client-side (max 50 shown), select dropdown, display_order select (1/2), 배정 button. Current assignments list with 해제 button per row. Uses `assignRealtorToComplex` and `removeRealtorAssignment` Server Actions. Optimistic update adds temp assignment to localAssignments state immediately on success.

## Deviations from Plan

None — plan executed exactly as written. The `AssignmentWithComplex` type matches the actual return type of `getAssignmentsByRealtor` (which includes nested `complexes` JOIN data), as required by the key constraint in the prompt.

## Verification

- `npm run lint -- --max-warnings=0`: No errors on any of the 6 files
- `npm run build`: Compiled successfully, types checked, all 26 pages generated. One pre-existing Windows filesystem error (`ENOTEMPTY: .next/export`) on first run resolved by cleaning the directory before rebuild — not related to this plan's changes.

## Known Stubs

None. All fields are wired to real Server Actions from 18-01.

## Threat Flags

No new threat surface beyond what is documented in the plan's threat model (T-18-02-01 through T-18-02-03). All three mitigations are implemented:
- T-18-02-01: Auth guard on all 3 RSC pages (createSupabaseServerClient + profiles.role check + redirect)
- T-18-02-02: `deleteRealtor` Server Action calls `requireAdmin()` internally
- T-18-02-03: `assignRealtorToComplex` Server Action validates in `requireAdmin()`, DB FK enforces complex_id validity

## Self-Check: PASSED

Files verified to exist:
- src/app/admin/realtors/page.tsx: FOUND
- src/app/admin/realtors/new/page.tsx: FOUND
- src/app/admin/realtors/[id]/edit/page.tsx: FOUND
- src/components/admin/RealtorActions.tsx: FOUND
- src/components/admin/RealtorCreateForm.tsx: FOUND
- src/components/admin/RealtorEditForm.tsx: FOUND

Commit f12ebf3 verified in git log.
