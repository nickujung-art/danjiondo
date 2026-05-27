# Phase 19: 어드민 UI/UX 전면 개선 — Pattern Map

**Mapped:** 2026-05-27
**Files analyzed:** 13 (4 new + 9 modified)
**Analogs found:** 13 / 13

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/app/admin/layout.tsx` | layout | request-response | `src/app/layout.tsx` | role-match |
| `src/app/admin/page.tsx` | route | request-response | `src/app/consent/page.tsx` (redirect pattern) | role-match |
| `src/components/admin/AdminSidebar.tsx` | component (RSC) | request-response | `src/components/auth/UserMenu.tsx` | role-match |
| `src/components/admin/AdminSidebarDrawer.tsx` | component (client) | event-driven | `src/components/admin/MemberActions.tsx` | role-match |
| `src/app/admin/status/page.tsx` | page (modify) | request-response | itself | exact |
| `src/app/admin/members/page.tsx` | page (modify) | request-response | itself | exact |
| `src/app/admin/reports/page.tsx` | page (modify) | request-response | itself | exact |
| `src/app/admin/ads/page.tsx` | page (modify) | request-response | itself | exact |
| `src/app/admin/realtors/page.tsx` | page (modify) | request-response | itself | exact |
| `src/app/admin/gps-requests/page.tsx` | page (modify) | request-response | itself | exact |
| `src/app/admin/cardnews/page.tsx` | page (modify) | request-response | itself | exact |
| `src/app/admin/listing-prices/page.tsx` | page (modify) | request-response | itself | exact |
| `src/app/admin/redevelopment/page.tsx` | page (modify) | request-response | itself | exact |

---

## Pattern Assignments

### `src/app/admin/layout.tsx` (layout, request-response)

**Analog:** `src/app/layout.tsx` (structure) + `src/app/admin/ads/page.tsx` (auth guard)

**This file is new. There is no existing admin layout — that is exactly what this phase creates.**

**Imports pattern** — copy from `src/app/layout.tsx` lines 1-6, adapted:
```typescript
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminSidebarDrawer } from '@/components/admin/AdminSidebarDrawer'
```

**Root layout structure** — copy from `src/app/layout.tsx` lines 36-51:
```typescript
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="font-sans antialiased">
        ...
        {children}
        ...
      </body>
    </html>
  )
}
```
Admin layout does NOT wrap `<html>`/`<body>` — it is a nested layout. The admin layout function signature is:
```typescript
export default async function AdminLayout({ children }: { children: React.ReactNode }) { ... }
```

**Auth guard pattern** — copy from `src/app/admin/ads/page.tsx` lines 38-51 (identical across all admin pages):
```typescript
const supabase = await createSupabaseServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login?next=/admin')

const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single()

if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
  redirect('/')
}
```
In the layout, the `redirect('/login?next=/admin')` path should be `/login?next=/admin` (generic, not page-specific).

**Parallel pending count fetch** — copy from `src/app/admin/status/page.tsx` lines 54-97 (parallel Promise.all pattern), extract only the three badge counts:
```typescript
const adminClient = createSupabaseAdminClient()
const [pendingReports, pendingAds, pendingGps] = await Promise.all([
  adminClient.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  adminClient.from('ad_campaigns').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  adminClient.from('gps_verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
])
const badges = {
  reports: pendingReports.count ?? 0,
  ads:     pendingAds.count ?? 0,
  gps:     pendingGps.count ?? 0,
}
```

**Layout shell structure** — two-column flex, sidebar fixed left, content right:
```tsx
return (
  <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-canvas)' }}>
    {/* Desktop sidebar — hidden on mobile */}
    <aside style={{ width: 240, flexShrink: 0, /* hidden <768px */ }}>
      <AdminSidebar badges={badges} />
    </aside>

    {/* Mobile top bar + drawer */}
    <AdminSidebarDrawer badges={badges} />

    {/* Page content */}
    <main style={{ flex: 1, minWidth: 0 }}>
      {children}
    </main>
  </div>
)
```

**revalidate** — set `export const revalidate = 0` (same as all admin pages) so badge counts are always fresh.

---

### `src/app/admin/page.tsx` (route, redirect)

**Analog:** `src/app/consent/page.tsx` lines 14-19 (redirect after condition check)

**This is the simplest file — pure redirect, no UI.**

```typescript
import { redirect } from 'next/navigation'

export default function AdminPage() {
  redirect('/admin/status')
}
```

No auth guard needed here — the shared layout (`layout.tsx`) in the same segment handles auth before this page renders. No `async` needed; `redirect()` is synchronous in Next.js 15.

---

### `src/components/admin/AdminSidebar.tsx` (RSC component)

**Analog:** `src/components/auth/UserMenu.tsx` (RSC that receives server data and renders links)

**This is a pure RSC — no `'use client'`.**

**Imports pattern** — copy from `src/components/auth/UserMenu.tsx` line 1-3, adapted:
```typescript
import Link from 'next/link'
```
No Supabase import needed — badges are passed as props from the layout.

**Props interface:**
```typescript
interface Props {
  pendingCounts: { reports: number; ads: number; gps: number }
}
```

**Active link detection** — `AdminSidebar` is a pure RSC that renders structure and badges. Active state is delegated to `AdminSidebarLinks` ('use client') which calls `usePathname()` directly. No `currentPath` prop is passed from the server — this is cleaner and avoids the `headers()` workaround.

**Menu item render pattern** — copy link style from `src/app/admin/cardnews/page.tsx` lines 96-104:
```tsx
<Link
  href="/admin/ads"
  style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)', textDecoration: 'none' }}
>
  광고 관리
</Link>
```
Active item adds: `fontWeight: 600, color: 'var(--fg-pri)', background: 'var(--bg-surface-2)'`

**Badge pattern** — copy status badge style from `src/app/admin/reports/page.tsx` lines 236-244:
```tsx
<span
  style={{
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: 4,
    font: '600 10px/1 var(--font-sans)',
    color: '#fff',
    background: 'var(--fg-negative)',  // from CONTEXT.md D-Claude's Discretion
  }}
>
  {count > 99 ? '99+' : count}
</span>
```
Badge is hidden when count is 0: `{count > 0 && <span ...>{count > 99 ? '99+' : count}</span>}`.

**Sidebar header** — copy logo pattern from `src/app/admin/ads/page.tsx` lines 82-85:
```tsx
<Link href="/" className="dj-logo">
  <span className="mark">단</span>
  <span>단지온도</span>
</Link>
```
Below the logo: a `<span>어드민</span>` label in `var(--fg-sec)`.

**No AI slop** — per CLAUDE.md: no backdrop-blur, gradient, glow, 보라/인디고 colors.

---

### `src/components/admin/AdminSidebarDrawer.tsx` (client component, mobile drawer)

**Analog:** `src/components/admin/MemberActions.tsx` (client component with `useState` + `useTransition` pattern)

**`'use client'` directive is required — this is the only drawer-specific client component.**

**Imports pattern** — copy from `src/components/admin/MemberActions.tsx` lines 1-3, adapted:
```typescript
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
```

**State pattern:**
```typescript
const [open, setOpen] = useState(false)
const pathname = usePathname()
```

**Hamburger button** — renders only on mobile (≤768px via CSS, e.g. `display: none` above 768px):
```tsx
<button
  type="button"
  onClick={() => setOpen(true)}
  aria-label="메뉴 열기"
  style={{ /* 44×44px tap target */ }}
>
  &#9776;
</button>
```

**Overlay + drawer** — when `open` is true:
```tsx
{open && (
  <>
    {/* Backdrop */}
    <div
      role="presentation"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 99,
        background: 'rgba(0,0,0,0.4)',
      }}
    />
    {/* Slide-in panel */}
    <div
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 240,
        zIndex: 100, background: '#fff',
        borderRight: '1px solid var(--line-default)',
      }}
    >
      <AdminSidebarContent
        badges={badges}
        currentPath={pathname}
        onClose={() => setOpen(false)}
      />
    </div>
  </>
)}
```

**Close on nav** — each menu `<Link>` in the drawer calls `onClose()` via `onClick` prop.

**`usePathname` usage** — this is the only place `usePathname` is needed. The desktop `AdminSidebar` receives `currentPath` as a prop from the layout (server-side). The drawer component reads it client-side via `usePathname()` directly.

---

## Shared Pattern: Auth Guard (applies to ALL existing admin pages — keep in place)

**Source:** `src/app/admin/ads/page.tsx` lines 37-51

**CRITICAL: Per CONTEXT.md D-05**, existing per-page auth guards remain in place even after the shared layout adds its own. Defense-in-depth — do NOT remove them from existing pages.

The identical pattern appears in all 9 existing admin pages:
```typescript
// 관리자 권한 확인
const supabase = await createSupabaseServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login?next=/admin/<page-slug>')

const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single()

if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
  redirect('/')
}
```

---

## Shared Pattern: Self-Contained Header Block (to REMOVE from 9 pages)

**Source:** `src/app/admin/ads/page.tsx` lines 61-90; identical in status, members, reports, realtors, listing-prices, redevelopment pages. Slightly different nav in cardnews (lines 93-105).

The block to remove from all pages:
```tsx
<div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>
  <header
    style={{
      height: 60,
      background: '#fff',
      borderBottom: '1px solid var(--line-default)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 32px',
      gap: 24,
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}
  >
    <Link href="/" className="dj-logo">
      <span className="mark">단</span>
      <span>단지온도</span>
    </Link>
    <span style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
      관리자 · [페이지명]
    </span>
  </header>
  ...
```

After removal, each page's JSX root becomes just the content `<div>` or `<main>` (no outer `minHeight: 100vh` wrapper needed — the layout shell provides it). The `<h1>` page title inside each page is **kept**.

**Special case — cardnews**: has a `<nav>` inside the header with an extra `<Link href="/admin/ads">광고 관리</Link>` — also remove with the header.

**Special case — gps-requests**: uses `<main style={{ padding: '32px', maxWidth: '960px', margin: '0 auto' }}>` as root instead of `<div>` + inner `<div>`. No `<header>` block. The `minHeight: 100vh` outer wrapper is also absent. This page only needs the `padding` / `maxWidth` wrapper kept — nothing to remove from a header perspective. The content can stay as-is.

---

## Shared Pattern: searchParams in RSC Page (for D-07, D-08, D-09, D-10)

**Source:** `src/app/admin/redevelopment/page.tsx` lines 74-78 and `src/app/consent/page.tsx` lines 11-15

**Pattern — async searchParams in Next.js 15 App Router:**
```typescript
export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string }>
}) {
  const { q = '', role = '', status = '' } = await searchParams
  // ...
  // Apply to Supabase query:
  let query = adminClient.from('profiles').select('...')
  if (q) query = query.or(`nickname.ilike.%${q}%,cafe_nickname.ilike.%${q}%`)
  if (role) query = query.eq('role', role)
  if (status === 'active') query = query.is('suspended_at', null).is('deleted_at', null)
  // etc.
}
```

The `searchParams` prop is `Promise<...>` in Next.js 15 — must be `await`ed. This pattern is confirmed in `src/app/admin/redevelopment/page.tsx` line 78: `const { saved, error: formError } = await searchParams`.

---

## Shared Pattern: Filter Row UI (for D-07, D-08, D-09, D-10)

**Source:** Derived from existing `input` / `select` patterns in `src/app/admin/listing-prices/page.tsx` lines 162-176 and the `.input` CSS class used project-wide.

**Filter bar placement**: immediately before the `<div className="card">` table, inside the content `<div>`. Matches CONTEXT.md "Specific Ideas" sketch.

**Filter input:**
```tsx
<div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
  <input
    type="search"
    defaultValue={q}
    name="q"
    placeholder="닉네임 검색"
    className="input"
    style={{ minWidth: 200 }}
    form="filter-form"
  />
  <select
    name="role"
    defaultValue={role}
    className="input"
    form="filter-form"
  >
    <option value="">전체 역할</option>
    <option value="admin">admin</option>
    <option value="member">member</option>
  </select>
  <button type="submit" className="btn btn-sm btn-orange" form="filter-form">
    필터
  </button>
</div>
<form id="filter-form" method="get" action="/admin/members" />
```

Use a `<form method="get">` that submits as URL searchParams — this is the standard RSC filter pattern. No JavaScript required; the page re-renders server-side with the new query params.

**Label style** (from listing-prices lines 155-162):
```tsx
<label
  htmlFor="..."
  style={{
    font: '500 11px/1 var(--font-sans)',
    color: 'var(--fg-sec)',
    marginBottom: 6,
    display: 'block',
  }}
>
```

---

## Shared Pattern: Status Badge / Chip (reuse across sidebar and pages)

**Source:** `src/app/admin/reports/page.tsx` lines 236-244

```tsx
<span
  style={{
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 4,
    font: '600 11px/1 var(--font-sans)',
    color: '#fff',
    background: STATUS_COLOR[r.status],
  }}
>
  {STATUS_LABEL[r.status]}
</span>
```

For pending count badges in sidebar: use same pattern but with `background: 'var(--fg-negative)'` (per CONTEXT.md Claude's Discretion).

---

## Shared Pattern: RSC Data Fetch + Admin Client (parallel Promise.all)

**Source:** `src/app/admin/status/page.tsx` lines 54-97

All admin pages use this two-client pattern:
1. `createSupabaseServerClient()` — user-scoped, for auth check
2. `createSupabaseAdminClient()` — service_role, for admin data queries (RLS bypass)

Parallel fetches with `Promise.all` for independent queries:
```typescript
const adminClient = createSupabaseAdminClient()
const [result1, result2, result3] = await Promise.all([
  adminClient.from('table1').select('...'),
  adminClient.from('table2').select('...').eq('status', 'pending'),
  adminClient.from('table3').select('*', { count: 'exact', head: true }),
])
```

---

## Per-Page Modification Details

### `src/app/admin/status/page.tsx` — remove header only

**Remove lines 128-151** (the `<header>` block and outer `<div style={{ minHeight: '100vh' ... }}>` opening). Keep `<main>` content from line 152 onward. The closing `</div>` on line 384 (matching the outer wrapper) is also removed.

After removal the component returns:
```tsx
return (
  <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
    <h1 ...>시스템 상태</h1>
    {/* all existing sections unchanged */}
  </main>
)
```

---

### `src/app/admin/members/page.tsx` — remove header + add search/filter

**Remove lines 51-73** (outer div + header). **Add** filter form before the table (see "Shared Pattern: Filter Row UI"). **Add** searchParams prop signature.

Filter params for members: `q` (text, searches nickname + cafe_nickname), `role` (enum: '', 'admin', 'member'), `status` (enum: '', 'active', 'suspended', 'deleted').

Supabase query additions after auth check:
```typescript
let query = adminClient
  .from('profiles')
  .select('id, nickname, cafe_nickname, role, created_at, suspended_at, deleted_at, terms_agreed_at')
  .order('created_at', { ascending: false })

if (q) query = query.or(`nickname.ilike.%${q}%,cafe_nickname.ilike.%${q}%`)
if (role) query = query.eq('role', role)
if (status === 'active') {
  query = query.is('suspended_at', null).is('deleted_at', null)
} else if (status === 'suspended') {
  query = query.not('suspended_at', 'is', null)
} else if (status === 'deleted') {
  query = query.not('deleted_at', 'is', null)
}
```

---

### `src/app/admin/reports/page.tsx` — remove header + add status/type filter

**Remove lines 85-109** (outer div + header). **Add** filter form. Current query is hardcoded to no status filter (shows all); add `status` and `target_type` params.

Filter params: `status` (enum: '', 'pending', 'accepted', 'rejected'), `target_type` (enum: '', 'review', 'user', 'ad', 'comment').

Query change — current line 77-82 removes the `.eq('status', 'pending')` filter; make it conditional:
```typescript
let query = (adminClient as any)
  .from('reports')
  .select('id, target_type, target_id, reason, status, created_at')

if (status) query = query.eq('status', status)
if (target_type) query = query.eq('target_type', target_type)

query = query
  .order('status', { ascending: true })
  .order('created_at', { ascending: false })
```

---

### `src/app/admin/ads/page.tsx` — remove header + add status filter

**Remove lines 60-90** (outer div + header). **Add** status filter.

Filter param: `status` (type `AdStatus | ''`).

Query change — `getAllAdCampaigns(adminClient)` currently returns all. Either:
- Pass status filter into `getAllAdCampaigns` as an optional param, or
- Filter the returned array client-side after fetch (simpler since list is small per CONTEXT.md).

Since CONTEXT.md says no pagination / MVP scale, inline filter is acceptable:
```typescript
const allCampaigns = await getAllAdCampaigns(adminClient)
const campaigns = status ? allCampaigns.filter(c => c.status === status) : allCampaigns
```

Status filter select options: `draft/초안`, `pending/검토중`, `approved/승인`, `ended/종료`, `rejected/거절`, `paused/일시중지` — use existing `STATUS_LABEL` map (lines 15-22).

---

### `src/app/admin/realtors/page.tsx` — remove header + add name/company/active filter

**Remove lines 30-60** (outer div + header). **Add** filter form.

Filter params: `q` (searches name + agency_name), `active` (enum: '', 'true', 'false').

`getAllRealtors(adminClient)` returns all realtors. Filter inline after fetch (MVP scale):
```typescript
const allRealtors = await getAllRealtors(adminClient)
const realtors = allRealtors.filter(r => {
  if (q && !r.name.includes(q) && !(r.agency_name ?? '').includes(q)) return false
  if (active === 'true' && !r.is_active) return false
  if (active === 'false' && r.is_active) return false
  return true
})
```

---

### `src/app/admin/gps-requests/page.tsx` — no header to remove, no changes needed

This page has no `<header>` block (uses `<main style={{ padding: '32px' }}>` as root). The layout shell wraps it transparently. **No modifications required** — the page content works as-is inside the new layout.

---

### `src/app/admin/cardnews/page.tsx` — remove header (including nav)

**Remove lines 69-106** (outer div + header with embedded nav). Content `<div>` from line 107 onward is kept.

The nav inside cardnews header (`<Link href="/admin/ads">광고 관리</Link>`) is replaced by the sidebar — no need to preserve it.

---

### `src/app/admin/listing-prices/page.tsx` — remove header only

**Remove lines 100-124** (outer div + header). Content `<div>` from line 125 onward is kept.

No filter additions needed for this page (CONTEXT.md scope).

---

### `src/app/admin/redevelopment/page.tsx` — remove header only

**Remove lines 132-156** (outer div + header). Content `<div>` from line 157 onward is kept.

The page already uses `searchParams` as `Promise<{ saved?: string; error?: string }>` — this pattern is compatible with adding more search params if needed in the future, but no new filters are in scope for Phase 19.

---

## No Analog Found

No files without a codebase analog. All new files have sufficient patterns from the existing codebase.

---

## CLAUDE.md Constraints Summary

These project-level constraints directly affect Phase 19 files:

| Constraint | Impact |
|---|---|
| RSC-first (`'use client'` 최소화) | `AdminSidebar` must be RSC; only `AdminSidebarDrawer` needs `'use client'` |
| Supabase 쿼리는 서버 컴포넌트 또는 API Route에서만 | Badge counts fetched in `layout.tsx` (RSC), never in drawer component |
| Server Action 우선 | Filter forms use `<form method="get">` (no Server Action needed; GET params) |
| AI 슬롭 금지 | No backdrop-blur, gradient-text, glow, 보라/인디고 — plain bg colors and `var(--fg-negative)` for badges |
| 컴포넌트는 `src/components/`, 도메인 함수는 `src/lib/` | Sidebar component goes in `src/components/admin/`, not `src/lib/` |

---

## Metadata

**Analog search scope:** `src/app/admin/`, `src/components/admin/`, `src/components/auth/`, `src/app/layout.tsx`, `src/lib/supabase/`
**Files scanned:** 22
**Pattern extraction date:** 2026-05-27
