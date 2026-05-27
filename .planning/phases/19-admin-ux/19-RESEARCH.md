# Phase 19: 어드민 UI/UX 전면 개선 — Research

**Researched:** 2026-05-27
**Domain:** Next.js 15 App Router shared layout, RSC auth guard, URL searchParams filtering, mobile drawer
**Confidence:** HIGH

---

## Summary

Phase 19는 기존 13개 어드민 페이지에 공유 레이아웃(사이드바)을 추가하고 핵심 목록 페이지에 검색·필터를 붙이는 작업이다. 순수 UI/구조 변경 Phase로 DB 마이그레이션이 필요 없다.

핵심 구현 결정: `src/app/admin/layout.tsx`는 RSC async 컴포넌트로 작성하여 권한 검증(requireAdminLayout)과 pending 카운트 3개를 서버에서 병렬 조회한다. `usePathname()` 같은 클라이언트 훅이 필요한 active 표시와 모바일 drawer는 별도의 클라이언트 컴포넌트(`AdminSidebarLinks`, `AdminSidebarDrawer`)로 분리한다. 각 페이지의 기존 auth guard는 defense-in-depth로 유지한다.

searchParams 타입은 Next.js 15에서 `Promise<{ [key: string]: string | string[] | undefined }>`로 변경되었으므로 `await searchParams`가 필수다. layout은 searchParams를 받지 않으며(내비게이션 시 재렌더링되지 않아 stale해짐) — 필터는 page.tsx에서만 처리한다.

**Primary recommendation:** AdminSidebar는 RSC(메뉴 구조 + 뱃지 카운트) + AdminSidebarLinks 클라이언트 자식(active state) + AdminSidebarDrawer 클라이언트(모바일 overlay)의 3-레이어 구조로 분리한다.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: 공유 어드민 레이아웃 구조**
- `src/app/admin/layout.tsx` 생성 — Next.js App Router 공유 레이아웃
- RSC (서버 컴포넌트) 기반: 권한 검증 + 미처리 카운트를 서버에서 조회
- 레이아웃 구조: 왼쪽 240px 고정 사이드바 + 오른쪽 children
- 모바일(≤768px): 사이드바 숨김 + 상단 햄버거 버튼으로 drawer 토글
- AI 슬롭 금지 (CLAUDE.md): backdrop-blur, gradient, glow, 보라/인디고 없이

**D-02: 사이드바 네비게이션 메뉴 구조**
9개 메뉴 항목 (아이콘 없이 텍스트만):
- 대시보드 → /admin/status
- 회원 관리 → /admin/members
- 신고 관리 → /admin/reports [pending_count 뱃지]
- 광고 관리 → /admin/ads [pending_count 뱃지]
- 중개사 관리 → /admin/realtors
- GPS 검증 → /admin/gps-requests [pending_count 뱃지]
- 카드뉴스 → /admin/cardnews
- 시세 입력 → /admin/listing-prices
- 재개발 관리 → /admin/redevelopment

**D-03: 미처리 항목 뱃지**
- 신고: `reports WHERE status='pending'` COUNT
- 광고: `ad_campaigns WHERE status='pending'` COUNT
- GPS: `gps_verification_requests WHERE status='pending'` COUNT
- 0이면 뱃지 숨김, 1 이상이면 표시 (최대 99+)
- 레이아웃 revalidate: 0

**D-04: 현재 페이지 active 표시**
- `usePathname()` 클라이언트 컴포넌트 사용
- `pathname.startsWith(href)` 방식으로 하위 경로도 active 처리

**D-05: 권한 검증 위치**
- 레이아웃에서 공통 권한 검증: `requireAdminLayout()`
- supabase server client + auth.getUser() + profiles.role 조회
- admin 또는 superadmin 이외: `/login?next=/admin` 리다이렉트
- 기존 각 페이지의 중복 권한 체크 코드는 유지 (defense in depth)

**D-06: /admin 루트 페이지**
- `src/app/admin/page.tsx` 생성, `redirect('/admin/status')` 단순 리다이렉트

**D-07: 회원 목록 검색·필터**
- 닉네임/카페닉네임 텍스트 검색 (URL searchParams)
- 역할 필터: 전체/admin/member
- 계정 상태 필터: 전체/활성/정지/탈퇴

**D-08: 신고 목록 필터**
- 상태 필터: 전체/pending/accepted/rejected
- 대상 유형 필터: 전체/review/user/ad/comment
- 기존 페이지의 `.eq('status', 'pending')` 고정 → 전체 보기로 변경

**D-09: 광고 목록 필터**
- 상태 필터: 전체/pending/approved/paused/rejected/ended

**D-10: 중개사 목록 검색**
- 이름/회사명 텍스트 검색
- 활성 상태 필터: 전체/활성/비활성

**D-11: 모바일 햄버거 메뉴**
- 768px 이하에서 상단바(60px) 좌측 햄버거 버튼
- 클릭 시 사이드바가 overlay drawer로 슬라이드인
- AdminSidebarDrawer 클라이언트 컴포넌트 분리

### Claude's Discretion
- 사이드바 폭: 240px
- 뱃지 색상: `var(--fg-negative)` 배경 + 흰 텍스트
- 검색/필터 UI: 기존 admin 페이지 스타일 (input, select 인라인)
- 필터 적용: URL searchParams 방식

### Deferred Ideas (OUT OF SCOPE)
- 페이지네이션
- 일괄 작업 (bulk operations)
- CSV 내보내기
- 감사 로그
- 어드민 전용 다크 테마
- 어드민 알림 (새 신고 실시간 알림)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMIN-10 | 공유 어드민 레이아웃 — 사이드바 네비게이션 + `/admin` 진입점 + 공통 권한 검증 | layout.tsx RSC + requireAdminLayout() + admin/page.tsx redirect |
| ADMIN-11 | 회원·신고·광고·중개사 목록 검색·필터 — 텍스트 검색 + 상태 드롭다운 필터 | Next.js 15 `await searchParams` + Supabase .or()/.eq() 쿼리 패턴 |
| ADMIN-12 | 사이드바 미처리 항목 뱃지 — pending 신고·광고·GPS 요청 카운트 표시 | layout RSC에서 Promise.all 병렬 COUNT 쿼리 |
| ADMIN-13 | 어드민 페이지 공통 UX 개선 — 모바일 햄버거 메뉴 + 현재 페이지 active 표시 + 빠른 액션 링크 | AdminSidebarLinks('use client' + usePathname) + AdminSidebarDrawer |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 권한 검증 (auth guard) | API / Backend (RSC) | — | 서버에서만 — 클라이언트에서 하면 우회 가능 |
| pending 카운트 조회 | API / Backend (RSC layout) | — | 레이아웃 서버 컴포넌트에서 Supabase 직접 쿼리 |
| 사이드바 메뉴 렌더링 | Frontend Server (RSC) | Browser (active state만) | 메뉴 구조·뱃지는 RSC, active 하이라이트는 클라이언트 |
| URL searchParams 필터링 | API / Backend (RSC page) | — | page.tsx에서 await searchParams 후 Supabase 쿼리 조건 추가 |
| 검색/필터 폼 UI | Browser (Client Component) | — | form submit이 URL 변경 → router.push() 또는 native form action |
| 모바일 drawer 토글 | Browser (Client Component) | — | useState로 open/close — RSC에서 불가 |
| /admin → /admin/status 리다이렉트 | API / Backend (RSC page) | — | redirect() 서버사이드 |

---

## Standard Stack

### Core (기존 프로젝트 스택 — 추가 설치 불필요)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 15.3.1 [VERIFIED: package.json] | layout.tsx, page.tsx, redirect | 이미 사용 중 |
| @supabase/ssr | 0.10.2 [VERIFIED: package.json] | createSupabaseServerClient() | 이미 사용 중 |
| TypeScript | 5.8.3 [VERIFIED: package.json] | strict mode | 이미 사용 중 |
| Tailwind CSS | 3.4.17 [VERIFIED: package.json] | CSS utility classes (현재 admin은 inline style 사용) | 이미 사용 중 |

### 추가 설치 불필요
이 Phase는 순수 UI/구조 변경이며 신규 npm 패키지가 필요 없다. [VERIFIED: phase scope 분석]

---

## Architecture Patterns

### System Architecture Diagram

```
브라우저 요청 /admin/*
        │
        ▼
src/app/admin/layout.tsx  (RSC async)
  ├─ requireAdminLayout()
  │    └─ createSupabaseServerClient() → auth.getUser() → profiles.role
  │    └─ 미승인 시: redirect('/login?next=/admin')
  │
  ├─ Promise.all([
  │    adminClient.from('reports').select COUNT WHERE status='pending',
  │    adminClient.from('ad_campaigns').select COUNT WHERE status='pending',
  │    adminClient.from('gps_verification_requests').select COUNT WHERE status='pending',
  │  ])
  │
  ├─ AdminSidebar RSC (menus + badge counts as props)
  │    └─ AdminSidebarLinks  'use client' (usePathname → active 스타일)
  │
  ├─ AdminSidebarDrawer  'use client' (모바일 overlay, useState open/close)
  │
  └─ <main>{children}</main>
           │
           ▼
     page.tsx (각 어드민 페이지, defense-in-depth auth guard 유지)
       └─ searchParams: Promise<{[key:string]: string|string[]|undefined}>
           └─ await searchParams → Supabase 쿼리 조건 추가
```

### Recommended Project Structure

```
src/
├── app/
│   └── admin/
│       ├── layout.tsx                    # 신규 — RSC 공유 레이아웃
│       ├── page.tsx                      # 신규 — redirect('/admin/status')
│       ├── status/page.tsx               # 수정 — 기존 header 블록 제거
│       ├── members/page.tsx              # 수정 — searchParams 필터 + header 제거
│       ├── reports/page.tsx              # 수정 — searchParams 필터 + header 제거
│       ├── ads/page.tsx                  # 수정 — searchParams 필터 + header 제거
│       ├── realtors/page.tsx             # 수정 — searchParams 검색 + header 제거
│       └── ...other pages...            # 수정 — header 블록만 제거
└── components/
    └── admin/
        ├── AdminSidebar.tsx              # 신규 — RSC, menus + badge props
        ├── AdminSidebarLinks.tsx         # 신규 — 'use client', usePathname active
        └── AdminSidebarDrawer.tsx        # 신규 — 'use client', 모바일 overlay
```

---

## Key Technical Findings

### Pattern 1: Next.js 15 layout.tsx — RSC async with auth + data fetch

[VERIFIED: nextjs.org/docs/app/api-reference/file-conventions/layout]

layout.tsx는 async RSC 컴포넌트로 작성 가능하며, `cookies()`와 `redirect()`를 서버에서 사용할 수 있다.

```typescript
// src/app/admin/layout.tsx
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminSidebarDrawer } from '@/components/admin/AdminSidebarDrawer'

export const revalidate = 0

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'superadmin'].includes((profile as { role: string } | null)?.role ?? '')) {
    redirect('/')
  }

  const adminClient = createSupabaseAdminClient()
  const [reportRes, adRes, gpsRes] = await Promise.all([
    adminClient.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    adminClient.from('ad_campaigns').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    adminClient.from('gps_verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const pendingCounts = {
    reports: reportRes.count ?? 0,
    ads: adRes.count ?? 0,
    gps: gpsRes.count ?? 0,
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* 데스크톱 사이드바 */}
      <AdminSidebar pendingCounts={pendingCounts} />
      {/* 모바일 drawer */}
      <AdminSidebarDrawer pendingCounts={pendingCounts} />
      <main style={{ flex: 1, minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
```

**중요 발견: layout은 navigation 시 재렌더링되지 않는다.** [VERIFIED: nextjs.org] 이는 pending 카운트가 페이지 이동 시 stale해질 수 있음을 의미한다. `revalidate = 0`은 전체 페이지 로드 시에만 최신화된다. 이는 acceptable tradeoff (CONTEXT.md D-03에서 허용됨).

### Pattern 2: Next.js 15 searchParams — Promise type

[VERIFIED: nextjs.org/docs/app/api-reference/file-conventions/page]

Next.js 15에서 `searchParams`는 `Promise`로 변경되었다. `await`가 필수.

```typescript
// src/app/admin/members/page.tsx
export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q.trim() : ''
  const role = typeof params.role === 'string' ? params.role : ''
  const status = typeof params.status === 'string' ? params.status : ''

  // ... auth guard (defense in depth)

  const adminClient = createSupabaseAdminClient()
  let query = adminClient
    .from('profiles')
    .select('id, nickname, cafe_nickname, role, created_at, suspended_at, deleted_at, terms_agreed_at')

  if (q) {
    query = query.or(`nickname.ilike.%${q}%,cafe_nickname.ilike.%${q}%`)
  }
  if (role) {
    query = query.eq('role', role)
  }
  if (status === 'active') {
    query = query.is('suspended_at', null).is('deleted_at', null)
  } else if (status === 'suspended') {
    query = query.not('suspended_at', 'is', null)
  } else if (status === 'deleted') {
    query = query.not('deleted_at', 'is', null)
  }

  const { data: members } = await query.order('created_at', { ascending: false })
  // ...
}
```

**경고:** `searchParams`를 layout에서 사용하면 안 된다. layout은 navigation 시 재렌더링되지 않으므로 searchParams가 stale해진다. [VERIFIED: nextjs.org]

### Pattern 3: AdminSidebarLinks — 'use client' with usePathname

[VERIFIED: nextjs.org docs — "Active Nav Links" 예제]

`usePathname()`은 클라이언트 훅이므로 layout.tsx(RSC)에서 직접 사용 불가. 별도 클라이언트 컴포넌트로 분리해야 한다.

```typescript
// src/components/admin/AdminSidebarLinks.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  label: string
  href: string
  pendingCount?: number
}

interface AdminSidebarLinksProps {
  items: NavItem[]
}

export function AdminSidebarLinks({ items }: AdminSidebarLinksProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="어드민 메뉴">
      {items.map(item => {
        const isActive = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderRadius: 6,
              font: `${isActive ? '700' : '500'} 14px/1 var(--font-sans)`,
              color: isActive ? 'var(--fg-pri)' : 'var(--fg-sec)',
              background: isActive ? 'var(--bg-surface-2)' : 'transparent',
              textDecoration: 'none',
            }}
          >
            <span>{item.label}</span>
            {(item.pendingCount ?? 0) > 0 && (
              <span
                aria-label={`미처리 ${item.pendingCount}건`}
                style={{
                  minWidth: 20,
                  height: 20,
                  padding: '0 6px',
                  borderRadius: 10,
                  background: 'var(--fg-negative)',
                  color: '#fff',
                  font: '700 11px/20px var(--font-sans)',
                  textAlign: 'center',
                }}
              >
                {(item.pendingCount ?? 0) > 99 ? '99+' : item.pendingCount}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
```

**주의:** `pathname.startsWith(item.href)` 패턴은 `/admin/status`와 `/admin` 모두에 match될 수 있다. 대시보드 메뉴 href를 `/admin/status`로 설정하고 루트 `/admin`은 page.tsx에서 redirect하므로 충돌 없음. 단, `/admin` href를 메뉴에 넣지 말 것.

### Pattern 4: AdminSidebarDrawer — 'use client' mobile overlay

```typescript
// src/components/admin/AdminSidebarDrawer.tsx
'use client'

import { useState } from 'react'
import { AdminSidebarLinks } from './AdminSidebarLinks'

interface PendingCounts {
  reports: number
  ads: number
  gps: number
}

export function AdminSidebarDrawer({ pendingCounts }: { pendingCounts: PendingCounts }) {
  const [isOpen, setIsOpen] = useState(false)
  const items = buildNavItems(pendingCounts)  // 공유 헬퍼

  return (
    <>
      {/* 모바일 상단바 (md:hidden) */}
      <div
        style={{
          height: 60,
          background: '#fff',
          borderBottom: '1px solid var(--line-default)',
          display: 'none',  // CSS @media로 제어
          alignItems: 'center',
          padding: '0 16px',
          gap: 16,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
        className="admin-mobile-header"
      >
        <button
          aria-label="메뉴 열기"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(true)}
          style={{ padding: 8, border: 'none', background: 'none', cursor: 'pointer' }}
        >
          {/* 햄버거 SVG — 이모지 금지, SVG path만 */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M2 5h16M2 10h16M2 15h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <span style={{ font: '600 14px/1 var(--font-sans)' }}>단지온도 어드민</span>
      </div>

      {/* Overlay backdrop */}
      {isOpen && (
        <div
          aria-hidden="true"
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 200,
          }}
        />
      )}

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="어드민 메뉴"
        style={{
          position: 'fixed',
          top: 0, left: 0, bottom: 0,
          width: 240,
          background: '#fff',
          borderRight: '1px solid var(--line-default)',
          zIndex: 201,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 200ms ease',
          overflowY: 'auto',
        }}
        className="admin-drawer"
      >
        <div style={{ padding: 16 }}>
          <AdminSidebarLinks items={items} />
        </div>
      </div>
    </>
  )
}
```

### Pattern 5: AdminSidebar RSC — 데스크톱 고정 사이드바

```typescript
// src/components/admin/AdminSidebar.tsx
import { AdminSidebarLinks } from './AdminSidebarLinks'

interface PendingCounts {
  reports: number
  ads: number
  gps: number
}

export function AdminSidebar({ pendingCounts }: { pendingCounts: PendingCounts }) {
  const items = buildNavItems(pendingCounts)

  return (
    <aside
      aria-label="어드민 사이드바"
      className="admin-sidebar"
      style={{
        width: 240,
        flexShrink: 0,
        background: '#fff',
        borderRight: '1px solid var(--line-default)',
        padding: '16px 8px',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: '0 8px 16px', borderBottom: '1px solid var(--line-subtle)' }}>
        <span style={{ font: '700 13px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
          단지온도 어드민
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        <AdminSidebarLinks items={items} />
      </div>
    </aside>
  )
}

// 공유 헬퍼 — AdminSidebar와 AdminSidebarDrawer 모두에서 사용
export function buildNavItems(pendingCounts: PendingCounts) {
  return [
    { label: '대시보드', href: '/admin/status' },
    { label: '회원 관리', href: '/admin/members' },
    { label: '신고 관리', href: '/admin/reports', pendingCount: pendingCounts.reports },
    { label: '광고 관리', href: '/admin/ads', pendingCount: pendingCounts.ads },
    { label: '중개사 관리', href: '/admin/realtors' },
    { label: 'GPS 검증', href: '/admin/gps-requests', pendingCount: pendingCounts.gps },
    { label: '카드뉴스', href: '/admin/cardnews' },
    { label: '시세 입력', href: '/admin/listing-prices' },
    { label: '재개발 관리', href: '/admin/redevelopment' },
  ]
}
```

**참고:** `buildNavItems`가 `AdminSidebar.tsx`에 export되면 `AdminSidebarDrawer.tsx`가 그걸 import해서 중복을 피한다.

### Pattern 6: 검색/필터 폼 — URL searchParams 방식

필터 폼은 GET 방식 `<form>` + `<input name="q">` + `<select name="status">`로 구현. form action 없이 method=GET이면 브라우저가 자동으로 URL searchParams에 붙여서 GET 요청 보냄. 별도 `router.push()` 불필요.

```typescript
// 검색/필터 폼 예시 — 'use client' 컴포넌트 불필요 (native GET form)
// members/page.tsx의 필터 행:
<form method="GET" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
  <input
    name="q"
    type="search"
    defaultValue={q}
    placeholder="닉네임 / 카페닉네임"
    className="input"
    style={{ width: 200 }}
  />
  <select name="role" defaultValue={role} className="input">
    <option value="">역할 전체</option>
    <option value="admin">admin</option>
    <option value="member">member</option>
  </select>
  <select name="status" defaultValue={status} className="input">
    <option value="">상태 전체</option>
    <option value="active">활성</option>
    <option value="suspended">정지</option>
    <option value="deleted">탈퇴</option>
  </select>
  <button type="submit" className="btn btn-sm">검색</button>
</form>
```

**장점:** 클라이언트 컴포넌트 불필요. URL 공유 가능. 브라우저 히스토리 지원. RSC page.tsx에서 `await searchParams`로 바로 읽음.

**주의 (ilike 쿼리 인젝션 방어):** Supabase `.or('nickname.ilike.%TEXT%')` 패턴에서 `TEXT`가 사용자 입력이므로 `%`, `_`, `\` 문자를 escape하거나, 사전에 최대 길이 제한(예: 50자)을 둬야 한다. 단순 trim + maxLength로 충분 (SQL injection 아님, Supabase PostgREST는 파라미터화됨).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| pathname 비교 | 수동 window.location 파싱 | `usePathname()` (Next.js 내장) | SSR에서 안전, hydration 일관성 |
| 검색 URL 동기화 | 커스텀 state + history.pushState | native GET form 또는 nuqs (이미 설치됨) | GET form이 가장 단순, nuqs는 더 복잡한 필터에만 |
| 모바일 overlay | CSS :checked hack | `useState` + 간단한 조건부 렌더링 | 접근성(aria-modal), 키보드 탈출 처리 |
| 병렬 DB 쿼리 | 순차 await | `Promise.all([...])` | 이미 status/page.tsx에서 사용 중인 패턴 |

---

## Common Pitfalls

### Pitfall 1: layout에서 searchParams 읽기 시도

**What goes wrong:** `layout.tsx`에서 `searchParams`를 prop으로 받으려 하거나 `useSearchParams()`를 호출하면 stale 값이 됨
**Why it happens:** Next.js layout은 내비게이션 시 재렌더링되지 않아 검색 파라미터가 old 값 유지
**How to avoid:** 검색/필터는 반드시 `page.tsx`에서 `await searchParams`로 처리
**Warning signs:** TypeScript 에러 — layout.tsx의 props 타입에 searchParams 없음

### Pitfall 2: layout에서 usePathname() 직접 호출

**What goes wrong:** `layout.tsx`(RSC)에서 `usePathname()` 호출 시 빌드 에러
**Why it happens:** `usePathname()`은 클라이언트 훅 — RSC에서 사용 불가
**How to avoid:** `AdminSidebarLinks` 클라이언트 컴포넌트로 분리, layout은 RSC 유지
**Warning signs:** "You're importing a component that needs usePathname. This React hook only works in a client component."

### Pitfall 3: 레이아웃 추가 후 기존 header가 중복 표시

**What goes wrong:** 기존 admin 페이지들의 `<header>` 블록이 레이아웃의 사이드바 위에 또 header를 그림
**Why it happens:** 모든 기존 admin 페이지에 자체 header(60px) 블록이 있음
**How to avoid:** layout.tsx 추가와 함께 기존 9개 페이지의 `<header>` 블록을 제거. `<h1>`은 유지
**Warning signs:** 화면 상단에 두 개의 nav bar가 보임

### Pitfall 4: defense-in-depth auth guard 제거

**What goes wrong:** layout에 auth guard가 생겼다고 각 페이지의 auth guard를 삭제하면 middleware bypass 취약점 발생
**Why it happens:** layout.tsx를 skip하는 경우(직접 RSC import 등)를 고려하지 않음
**How to avoid:** D-05 결정대로 기존 각 페이지의 auth guard는 유지 (코드 중복이지만 보안상 필요)

### Pitfall 5: 모바일에서 admin-sidebar 숨김 미처리

**What goes wrong:** 768px 미만에서 데스크톱 사이드바가 그대로 표시되어 레이아웃 깨짐
**Why it happens:** inline style만으로는 @media query 적용 불가
**How to avoid:** `className="admin-sidebar"` 부여 후 globals.css에 `@media (max-width: 768px) { .admin-sidebar { display: none; } }` 추가. 또는 Tailwind `hidden md:flex` 클래스 사용
**Warning signs:** 모바일에서 사이드바와 콘텐츠가 겹침

### Pitfall 6: gps_verification_requests 테이블 타입 부재

**What goes wrong:** `adminClient.from('gps_verification_requests').select('*', { count: 'exact', head: true })` 쿼리 시 TypeScript 에러 가능
**Why it happens:** `gps_verification_requests`가 database.ts 타입에 없을 수 있음 (Phase 6에서 추가됨)
**How to avoid:** 기존 gps-requests/page.tsx가 이미 작동 중이므로 타입이 존재함을 확인. 없다면 `(adminClient as any)` 캐스트 사용 (reports 페이지 패턴 참조)

### Pitfall 7: pending 카운트 0 체크 없이 뱃지 렌더

**What goes wrong:** count가 0일 때도 뱃지 `<span>`이 렌더되어 "0" 숫자가 보임
**Why it happens:** 조건부 렌더링 누락
**How to avoid:** `{count > 0 && <span>...</span>}` 패턴 사용

---

## Existing Pages Analysis

### 공통 패턴 (6개 페이지 전수 확인)

**제거 대상 — 각 페이지의 `<header>` 블록:**
```tsx
// 이 패턴이 모든 admin 페이지에 존재 (수정 대상)
<header style={{ height: 60, background: '#fff', borderBottom: '1px solid var(--line-default)', ... }}>
  <Link href="/" className="dj-logo">...</Link>
  <span>관리자 · [페이지명]</span>
</header>
```

**유지 대상 — 각 페이지의 auth guard:**
```typescript
// 이 패턴은 모든 페이지에 유지 (defense in depth)
const supabase = await createSupabaseServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login?next=/admin/XXX')
const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
if (!['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) redirect('/')
```

**영향받는 파일 목록:**
- `src/app/admin/status/page.tsx` — header 제거 (h1은 유지)
- `src/app/admin/members/page.tsx` — header 제거 + searchParams 필터 추가
- `src/app/admin/reports/page.tsx` — header 제거 + searchParams 필터 추가 + 전체 조회로 변경
- `src/app/admin/ads/page.tsx` — header 제거 + searchParams 필터 추가
- `src/app/admin/realtors/page.tsx` — header 제거 + searchParams 검색 추가
- `src/app/admin/gps-requests/page.tsx` — header 제거 (현재 `<main>` 직접 사용 — header 없음)
- `src/app/admin/cardnews/page.tsx` — header 제거 (특이: `<nav aria-label="관리자 메뉴">` 포함)
- `src/app/admin/listing-prices/page.tsx` — header 제거
- `src/app/admin/redevelopment/page.tsx` — header 제거 (확인 필요)

**gps-requests/page.tsx 특이사항:** 기존에 header 블록이 없고 `<main style={{ padding: '32px', ... }}>` 직접 사용. layout 추가 후 `<main>` 내부만 남기면 됨. 레이아웃과 충돌 없음.

**cardnews/page.tsx 특이사항:** header 내에 `<nav aria-label="관리자 메뉴">` 링크가 포함됨. layout의 사이드바가 이를 대체하므로 전체 header 블록 제거.

### Supabase 쿼리 패턴 확인

**reports 테이블:** `(adminClient as any).from('reports')` — database.ts 타입 미생성. layout에서도 동일 캐스트 필요. [VERIFIED: reports/page.tsx line 76-83]

**ad_campaigns 테이블:** `getAllAdCampaigns(adminClient)` 헬퍼 사용. layout에서 직접 `.from('ad_campaigns').select('*', { count: 'exact', head: true }).eq('status', 'pending')` 사용 가능 (타입 있음). [VERIFIED: ads/page.tsx]

**gps_verification_requests 테이블:** `adminClient.from('gps_verification_requests')` 직접 사용. 타입 있음. [VERIFIED: gps-requests/page.tsx]

---

## Runtime State Inventory

해당 없음 — 이 Phase는 리네임/리팩터가 아닌 신규 레이아웃 추가. 데이터 마이그레이션 없음.

---

## Environment Availability

Step 2.6: 이 Phase는 신규 npm 패키지 설치 없이 기존 Next.js 15 + Supabase 스택만 사용. 외부 의존성 없음.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Next.js | layout.tsx, searchParams | ✓ | 15.3.1 | — |
| @supabase/ssr | createSupabaseServerClient | ✓ | 0.10.2 | — |
| usePathname | AdminSidebarLinks | ✓ | Next.js 내장 | — |
| useState | AdminSidebarDrawer | ✓ | React 19.1.0 | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test -- --run src/__tests__/admin-layout.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMIN-10 | requireAdminLayout: 비로그인 → redirect('/login?next=/admin') | unit | `npm run test -- --run src/__tests__/admin-layout.test.ts` | ❌ Wave 0 |
| ADMIN-10 | requireAdminLayout: role='member' → redirect('/') | unit | `npm run test -- --run src/__tests__/admin-layout.test.ts` | ❌ Wave 0 |
| ADMIN-11 | members searchParams q 필터 → ilike 쿼리 조건 포함 | unit | `npm run test -- --run src/__tests__/admin-members-filter.test.ts` | ❌ Wave 0 |
| ADMIN-11 | reports status 필터 변경 → 전체 조회 가능 | unit | `npm run test -- --run src/__tests__/admin-members-filter.test.ts` | ❌ Wave 0 |
| ADMIN-12 | pending counts 3개 병렬 조회 | unit | `npm run test -- --run src/__tests__/admin-layout.test.ts` | ❌ Wave 0 |
| ADMIN-13 | buildNavItems: pendingCount > 99 → '99+' | unit | `npm run test -- --run src/__tests__/admin-layout.test.ts` | ❌ Wave 0 |
| ADMIN-13 | buildNavItems: pendingCount = 0 → 뱃지 없음 | unit | `npm run test -- --run src/__tests__/admin-layout.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- --run src/__tests__/admin-layout.test.ts`
- **Per wave merge:** `npm run test`
- **Phase gate:** `npm run lint && npm run build && npm run test`

### Wave 0 Gaps
- [ ] `src/__tests__/admin-layout.test.ts` — ADMIN-10, ADMIN-12, ADMIN-13 커버
- [ ] `src/__tests__/admin-members-filter.test.ts` — ADMIN-11 커버
- 기존 패턴: `vi.mock('next/headers')`, `vi.mock('@/lib/supabase/server')`, `vi.stubEnv()` 사용

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | requireAdminLayout() — auth.getUser() + role check |
| V3 Session Management | yes | @supabase/ssr cookie 기반 세션 (기존 패턴 유지) |
| V4 Access Control | yes | ['admin', 'superadmin'] role 검사 in layout + defense-in-depth in pages |
| V5 Input Validation | yes | searchParams q 필드 — trim + 최대 길이 제한 권장 |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Admin layout bypass | Elevation of Privilege | Defense-in-depth: auth guard 기존 page에 유지 |
| searchParams injection | Tampering | Supabase PostgREST 파라미터화 + input trim + maxLength |
| CSRF on filter form | Spoofing | GET form — 상태 변경 없으므로 CSRF 해당 없음 |

---

## Project Constraints (from CLAUDE.md)

- **RSC 기본, 'use client' 최소화:** layout.tsx는 RSC. AdminSidebarLinks + AdminSidebarDrawer만 'use client'
- **Supabase 쿼리는 서버 컴포넌트 또는 API Route에서만:** layout.tsx(RSC)에서 조회. 클라이언트 컴포넌트(AdminSidebarLinks, AdminSidebarDrawer)에서는 Supabase 쿼리 없음
- **Server Action 우선:** 이 Phase에서 mutation 없음. GET 폼으로 searchParams 처리
- **AI 슬롭 금지:** backdrop-blur, gradient-text, glow, 보라/인디고 사용 금지. 사이드바는 흰 배경 + 선 구분선 패턴
- **TDD 필수:** Wave 0에서 테스트 먼저 작성
- **광고 게재 쿼리:** 이 Phase에서 광고 게재 쿼리 없음. 광고 목록 필터(status 필터)는 조회 목적이므로 해당 제약 없음

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gps_verification_requests` 테이블이 `database.ts` 타입에 정의되어 있음 (gps-requests/page.tsx가 작동 중이므로 타입 존재 추정) | Standard Stack | 타입 없으면 `(adminClient as any)` 캐스트 필요 — 컴파일 에러 발생 |
| A2 | `redevelopment/page.tsx`가 다른 admin 페이지와 동일한 header 패턴 사용 | Existing Pages Analysis | header 제거 위치 달라질 수 있음 — 파일 확인 필요 |
| A3 | globals.css 또는 Tailwind를 통해 `.admin-sidebar { display: none }` @media query 추가 가능 | Architecture Patterns | 프로젝트가 inline-style only 방식이면 별도 전략 필요 |

---

## Open Questions

1. **globals.css @media query 추가 가능 여부**
   - What we know: 현재 admin 페이지는 inline style 사용. globals.css 존재함 (root layout에서 import)
   - What's unclear: globals.css에 admin-specific @media query를 추가하는 게 프로젝트 컨벤션에 맞는지
   - Recommendation: Tailwind `hidden md:block` 클래스가 있으므로 className 방식 사용 가능. 또는 globals.css에 `.admin-sidebar` 클래스 추가

2. **reports 타입 캐스트 해결**
   - What we know: reports 페이지에서 `(adminClient as any)` 캐스트 사용 중
   - What's unclear: layout에서 reports COUNT 쿼리 시 동일 패턴 필요한지 또는 타입이 업데이트됐는지
   - Recommendation: layout에서도 동일하게 `(adminClient as any).from('reports')` 사용

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: nextjs.org/docs/app/api-reference/file-conventions/layout] — layout.tsx props, searchParams 미접근, pathname 접근 불가, Fetching Data 패턴
- [VERIFIED: nextjs.org/docs/app/api-reference/file-conventions/page] — searchParams: Promise<...> Next.js 15 타입, await 필수
- [VERIFIED: package.json] — next 15.3.1, react 19.1.0, @supabase/ssr 0.10.2, vitest 2.1.9

### Secondary (MEDIUM confidence)
- [VERIFIED: 코드베이스 직접 분석] — 6개 admin 페이지 전수 확인, auth guard 패턴, header 블록 구조, createSupabaseAdminClient 사용 패턴

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — package.json 직접 확인
- Architecture (layout.tsx pattern): HIGH — Next.js 공식 문서 확인
- searchParams Promise type: HIGH — Next.js 공식 문서 확인
- Existing pages analysis: HIGH — 코드베이스 직접 읽음
- Mobile CSS: MEDIUM — globals.css 직접 확인 안 함, A3 assumption

**Research date:** 2026-05-27
**Valid until:** 2026-06-27 (Next.js 15 stable, 변경 가능성 낮음)
