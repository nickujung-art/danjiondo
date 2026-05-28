# Phase 18: 공인중개사 추천 섹션 — Research

**Researched:** 2026-05-26
**Domain:** Next.js 15 App Router, Supabase (RLS + MCP migration), Admin CRUD patterns
**Confidence:** HIGH — all findings are verified by direct codebase inspection

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
| ID | Decision |
|----|----------|
| D-01 | `in_feed` 광고 섹션은 단지 상세에서 완전 제거. `getActiveAds('in_feed')` 호출도 제거 |
| D-02 | `realtors`/`realtor_assignments` 쿼리는 서버 컴포넌트(RSC)에서만 — `createReadonlyClient()` 사용 |
| D-03 | 어드민 write는 기존 `requireAdmin()` + `createSupabaseAdminClient()` 패턴 동일 |
| D-04 | 단지 배정 UI는 `/admin/realtors` 페이지 내 인라인 (별도 라우트 불필요) |
| D-05 | `RealtorCard` — `'use client'` 불필요, 순수 표현 컴포넌트 (RSC) |
| D-06 | 이미지 없을 때 fallback: 이니셜 기반 텍스트 아바타 |
| D-07 | `tel:` 링크는 `<a href="tel:...">` — Next.js `Link` 불필요 |
| D-08 | Supabase MCP로 마이그레이션 적용 — `npm run db:push` 금지 |

### Claude's Discretion
- 없음 (모든 주요 결정 잠금)

### Deferred Ideas (OUT OF SCOPE)
- 광고비 처리, 결제 연동
- 공인중개사 자격 자동 검증
- 공인중개사 자체 로그인/포털
- 단지 상세 페이지 외 다른 위치 노출
- 클릭·임프레션 통계 (`ad_events` 패턴)
</user_constraints>

---

## Summary

Phase 18은 현재 단지 상세 페이지(`/complexes/[id]`) right rail 하단에 있는 `in_feed` 광고 섹션을 공인중개사 추천 카드로 교체하는 작업이다. 두 개의 새 테이블(`realtors`, `realtor_assignments`)을 추가하고, 어드민 CRUD UI, 데이터 레이어 함수, RealtorCard 컴포넌트를 구현한다.

프로젝트는 이미 완성된 ads 패턴(ad-actions.ts, ads.ts, AdminCampaignActions, AdCreateForm, AdEditForm)을 갖추고 있으며, 이 패턴을 직접 복사·변형하면 된다. `requireAdmin()`, `createSupabaseAdminClient()`, `createReadonlyClient()`, `revalidatePath()` 패턴은 모두 확립되어 있다.

단지 배정 UI의 "complex 검색" 기능은 주의가 필요하다. 기존 `searchComplexes()` 함수는 DB RPC(`search_complexes`)에 `p_sgg_codes` 배열을 필수로 요구한다. 어드민 배정 화면에서는 전체 단지를 검색해야 하므로, 재건축 어드민 페이지(`/admin/redevelopment`)처럼 서버사이드에서 전체 단지를 미리 로드하거나(500개 limit), 또는 간단히 이름으로 `ILIKE` 검색하는 별도 API Route/Server Action이 필요하다.

**Primary recommendation:** ads 도메인의 기존 파일 4개(ad-actions.ts, ads.ts, AdCreateForm.tsx, AdminCampaignActions.tsx)를 기준 템플릿으로 삼아 `realtor-actions.ts`, `realtors.ts`, `RealtorCreateForm.tsx`, `RealtorActions.tsx`를 구현한다.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DB 마이그레이션 (realtors + realtor_assignments) | Database / Supabase | — | Wave 0 BLOCKING 작업, Supabase MCP 적용 |
| 공인중개사 목록 조회 (단지 상세) | Frontend Server (RSC) | — | D-02: createReadonlyClient() 전용, ISR 86400s |
| 공인중개사 목록 조회 (어드민) | Frontend Server (RSC) | — | createSupabaseAdminClient() RLS 우회 |
| 어드민 CRUD write (create/update/delete) | API / Backend (Server Action) | — | D-03: requireAdmin() + adminClient |
| 단지 배정 write (assign/unassign) | API / Backend (Server Action) | — | D-03 동일 패턴 |
| RealtorCard 렌더링 | Browser / Client | — | D-05: 순수 RSC, use client 불필요 |
| 이미지 업로드 | API / Backend (Server Action) | Supabase Storage | uploadAdImage 패턴 재사용 또는 신규 bucket |
| 단지 검색 (배정 UI) | Frontend Server (RSC) | — | 서버사이드 전체 로드 (redevelopment 패턴) |

---

## Q1: in_feed 광고 섹션 현재 구조

[VERIFIED: codebase inspection — src/app/complexes/[id]/page.tsx]

### 제거 대상 코드 (exact locations)

**import 제거:**
```typescript
// line 6 — 제거 대상
import { getActiveAds } from '@/lib/data/ads'
```

**Promise.all 내 항목 제거:**
```typescript
// lines 208-224 — 구조분해에서 sidebarAds는 유지, inFeedAds 제거
const [
  saleData,
  sidebarAds,
  inFeedAds,          // <-- 제거
  reviews,
  ...
] = await Promise.all([
  ...
  getActiveAds('sidebar', supabase),    // <-- 유지
  getActiveAds('in_feed', supabase, complex.sgg_code ?? undefined),  // <-- 제거
  ...
])
```

**JSX 제거 (lines 811-833):**
```tsx
{/* 이 지역 관련 광고 */}
{inFeedAds.length > 0 && (
  <section style={{ marginTop: 32, paddingBottom: 40 }}>
    <h2 style={{ ... }}>이 지역 관련 광고</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
      {inFeedAds.slice(0, 2).map(ad => (
        <AdBanner key={ad.id} ad={ad} />
      ))}
    </div>
  </section>
)}
```

> `AdBanner` import(line 17)는 sidebarAds 렌더링에도 사용되므로 **유지**해야 한다.

### 새 섹션 삽입 위치

in_feed 섹션 제거 후, right rail(`<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>` — line 735) 내부에 `sidebarAds` 렌더 다음에 추가:
```tsx
{realtors.length > 0 && (
  <section style={{ marginTop: 8 }}>
    <h2 style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-sec)', margin: '0 0 12px' }}>
      이 단지 담당 공인중개사
    </h2>
    {realtors.map(r => <RealtorCard key={r.id} realtor={r} />)}
  </section>
)}
```

---

## Q2: 어드민 페이지 구조

[VERIFIED: codebase inspection — src/app/admin/]

### 현재 어드민 디렉터리 구조
```
src/app/admin/
├── ads/
│   ├── page.tsx          (목록 + 테이블)
│   ├── new/page.tsx      (등록 폼)
│   └── [id]/
│       └── edit/page.tsx (수정 폼)
├── cardnews/
├── gps-requests/
├── listing-prices/
├── members/
├── redevelopment/
├── reports/
└── status/
```

### 어드민 헤더 패턴 (공통)
모든 어드민 페이지는 **별도 레이아웃 없이** 각 page.tsx가 직접 헤더를 렌더링한다. 공통 nav 컴포넌트나 sidebar가 없다. 예시:
```tsx
<header style={{ height: 60, background: '#fff', borderBottom: '1px solid var(--line-default)',
  display: 'flex', alignItems: 'center', padding: '0 32px', gap: 24, ... }}>
  <Link href="/" className="dj-logo">
    <span className="mark">단</span><span>단지온도</span>
  </Link>
  <span style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
    관리자 · {섹션명}
  </span>
</header>
```

**결론: `/admin/realtors` 추가 시 기존 nav 변경 불필요.** 각 페이지가 자급자족 헤더를 가진다.

### 권한 확인 패턴 (모든 어드민 페이지 공통)
```typescript
const supabase = await createSupabaseServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login?next=/admin/realtors')

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

## Q3: 데이터 레이어 패턴

[VERIFIED: src/lib/data/ads.ts]

### 표준 패턴
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type Realtor = Database['public']['Tables']['realtors']['Row']

export async function getRealtorsByComplexId(
  complexId: string,
  supabase: SupabaseClient<Database>,
): Promise<Realtor[]> {
  const { data } = await supabase
    .from('realtor_assignments')
    .select('display_order, realtors(*)')
    .eq('complex_id', complexId)
    .order('display_order', { ascending: true })
  // realtors 테이블 is_active=true 필터 — JOIN에서 처리하거나 앱 레벨 필터
  return (data ?? [])
    .map(row => (row as { realtors: Realtor | null }).realtors)
    .filter((r): r is Realtor => r !== null && r.is_active)
}

export async function getAllRealtors(
  supabase: SupabaseClient<Database>,
): Promise<Realtor[]> {
  const { data } = await supabase
    .from('realtors')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}
```

**클라이언트 선택 기준 (D-02/D-03):**
- 읽기 (단지 상세 RSC): `createReadonlyClient()` — 쿠키 없음, ISR 정상 동작
- 읽기 (어드민 RSC): `createSupabaseAdminClient()` — RLS 우회, 비활성 포함 전체 조회
- 쓰기 (Server Action): `createSupabaseAdminClient()` via `requireAdmin()` 반환값

---

## Q4: Server Actions 패턴

[VERIFIED: src/lib/auth/ad-actions.ts]

### requireAdmin() 패턴
```typescript
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

async function requireAdmin(): Promise<{ error: string | null; admin: AdminClient | null }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다', admin: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    return { error: '관리자 권한이 필요합니다', admin: null }
  }

  return { error: null, admin: createSupabaseAdminClient() }
}
```

### createRealtor 패턴 (formData 방식)
```typescript
export async function createRealtor(
  formData: FormData,
): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const name = formData.get('name')
  // ... 필수 필드 타입 검증

  if (typeof name !== 'string' || !name.trim()) {
    return { error: '필수 항목을 입력하세요.' }
  }

  const { error: dbErr } = await admin.from('realtors').insert({
    name: (name as string).trim(),
    // ...
  })

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/realtors')
  return { error: null }
}
```

### assignRealtorToComplex 패턴 (upsert + conflict 처리)
```typescript
export async function assignRealtorToComplex(
  realtorId: string,
  complexId: string,
  displayOrder: 1 | 2,
): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  // UNIQUE(complex_id, display_order) — 충돌 시 교체
  const { error: dbErr } = await admin
    .from('realtor_assignments')
    .upsert({ realtor_id: realtorId, complex_id: complexId, display_order: displayOrder },
             { onConflict: 'complex_id,display_order' })

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/realtors')
  return { error: null }
}
```

---

## Q5: DB 타입 — database.ts 추가 내용

[VERIFIED: src/types/database.ts 전체 구조 확인]

현재 `database.ts`는 `supabase gen types` 자동 생성 파일이다. 마이그레이션 적용 후 Supabase MCP `generate_typescript_types`로 재생성하는 것이 올바른 방법이다.

**임시 타입 추가 패턴 (재생성 전 개발용):**

Wave 0(마이그레이션)이 완료되고 타입 재생성이 이루어지기 전까지, `src/lib/data/realtors.ts` 내에서 수동 타입 정의를 사용한다:

```typescript
// database.ts 재생성 전까지 수동 타입 (admin-actions.ts의 as any 캐스트 패턴 참고)
export interface Realtor {
  id: string
  name: string
  agency_name: string
  phone: string
  description: string | null
  license_no: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RealtorAssignment {
  id: string
  realtor_id: string
  complex_id: string
  display_order: 1 | 2
  created_at: string
}
```

**database.ts에 추가될 최종 타입 블록 (MCP 재생성 후):**
```typescript
realtors: {
  Row: {
    id: string
    name: string
    agency_name: string
    phone: string
    description: string | null
    license_no: string | null
    image_url: string | null
    is_active: boolean
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    name: string
    agency_name: string
    phone: string
    description?: string | null
    license_no?: string | null
    image_url?: string | null
    is_active?: boolean
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    name?: string
    agency_name?: string
    phone?: string
    description?: string | null
    license_no?: string | null
    image_url?: string | null
    is_active?: boolean
    created_at?: string
    updated_at?: string
  }
  Relationships: []
}
realtor_assignments: {
  Row: {
    id: string
    realtor_id: string
    complex_id: string
    display_order: number
    created_at: string
  }
  Insert: {
    id?: string
    realtor_id: string
    complex_id: string
    display_order: number
    created_at?: string
  }
  Update: {
    id?: string
    realtor_id?: string
    complex_id?: string
    display_order?: number
    created_at?: string
  }
  Relationships: [
    { foreignKeyName: "realtor_assignments_realtor_id_fkey", columns: ["realtor_id"], isOneToOne: false, referencedRelation: "realtors", referencedColumns: ["id"] },
    { foreignKeyName: "realtor_assignments_complex_id_fkey", columns: ["complex_id"], isOneToOne: false, referencedRelation: "complexes", referencedColumns: ["id"] },
  ]
}
```

---

## Q6: 이미지 업로드 및 스토리지

[VERIFIED: src/lib/auth/ad-actions.ts — uploadAdImage 함수]

### 현재 유일한 스토리지 버킷: `ad-images`

```typescript
// ad-actions.ts의 uploadAdImage
const { error: upErr } = await admin.storage
  .from('ad-images')
  .upload(path, bytes, { contentType: file.type, upsert: false })

const { data } = admin.storage.from('ad-images').getPublicUrl(path)
```

### 결정: 별도 `realtor-images` 버킷 신설 권장

이유:
1. 공인중개사 이미지는 `ad-images`와 성격이 다름 (광고 크리에이티브 vs 인물 프로필)
2. Wave 0 마이그레이션 SQL에서 버킷 생성 포함 가능 (`supabase_storage.buckets` INSERT 또는 MCP 툴 사용)
3. 기존 `uploadAdImage`를 제네릭화하거나 복사·변형하여 `uploadRealtorImage` 구현

### uploadRealtorImage 구현 패턴
```typescript
export async function uploadRealtorImage(
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { url: null, error: error! }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { url: null, error: '파일을 선택하세요.' }
  if (file.size > 5 * 1024 * 1024) return { url: null, error: '파일 크기는 5MB 이하여야 합니다.' }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: upErr } = await admin.storage
    .from('realtor-images')
    .upload(path, bytes, { contentType: file.type, upsert: false })

  if (upErr) return { url: null, error: upErr.message }

  const { data } = admin.storage.from('realtor-images').getPublicUrl(path)
  return { url: data.publicUrl, error: null }
}
```

---

## Q7: 어드민 네비게이션

[VERIFIED: 모든 admin page.tsx 파일 구조 확인]

**결론: 추가 작업 없음.** 어드민 섹션 간 공통 내비게이션 컴포넌트(사이드바, 글로벌 nav)가 존재하지 않는다. 각 어드민 페이지는 자체 헤더만 가지며, `/admin` 인덱스 페이지도 없다.

`/admin/realtors` 페이지는 동일한 자급자족 헤더 패턴으로 구현하면 된다:
```tsx
<span style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
  관리자 · 공인중개사 관리
</span>
```

---

## Q8: 단지 배정 — Complex 검색 UI

[VERIFIED: src/app/admin/redevelopment/page.tsx, src/lib/data/complex-search.ts]

### 두 가지 패턴 존재

**패턴 A: 서버사이드 전체 로드 (redevelopment 어드민 패턴)**
```typescript
// 서버에서 미리 전체 단지 로드 (최대 500개)
const { data: activeComplexes } = await adminClient
  .from('complexes')
  .select('id, canonical_name, si, gu, status')
  .in('status', ['active', 'in_redevelopment'])
  .order('canonical_name')
  .limit(500)
```
그 후 HTML `<select>` 또는 클라이언트 `<input>` + 필터링으로 구현.

**패턴 B: searchComplexes RPC 함수**
```typescript
// src/lib/data/complex-search.ts
export async function searchComplexes(
  query: string,
  sggCodes: string[],  // 필수 파라미터 — 빈 배열 허용 안 됨
  supabase: SupabaseClient,
  limit = 20,
): Promise<ComplexSearchResult[]>
```
단점: `sggCodes`가 필수이므로 전체 검색에는 SGG code 목록 전달 필요.

### 권장: 패턴 A (서버사이드 전체 로드)

Phase 18 어드민은 단지 수가 많지 않은 창원·김해 단지만 대상이므로 서버사이드에서 전체를 로드해 클라이언트 `<select>` 또는 `<input>` 필터링으로 처리하는 것이 단순하다.

단지 수가 많을 경우를 위한 대안: `Server Action` 또는 API Route에서 `ILIKE` 쿼리로 실시간 검색 (맵 페이지의 `search_complexes` RPC 패턴을 전체 SGG로 확장).

---

## Standard Stack

### Core (Phase 18에 사용)
| 라이브러리 | 버전 | 용도 | 근거 |
|-----------|------|------|------|
| Next.js App Router | 15.x | RSC, Server Actions, 라우팅 | 프로젝트 기본 |
| `@supabase/supabase-js` | 기존 | DB 쿼리, 스토리지 | 프로젝트 기본 |
| `@supabase/ssr` | 기존 | 서버 쿠키 기반 auth | createSupabaseServerClient() |

### Supporting
| 라이브러리 | 용도 |
|-----------|------|
| `react-hook-form` + `zod` | 어드민 폼 (기존 패턴에서 미사용 — 기존 FormData 방식 유지) |
| `next/cache revalidatePath` | Server Action 후 캐시 무효화 |

---

## Architecture Patterns

### 추천 프로젝트 구조 (신규 파일)
```
src/
├── lib/
│   ├── data/
│   │   └── realtors.ts          # getRealtorsByComplexId, getAllRealtors, getRealtorById
│   └── auth/
│       └── realtor-actions.ts   # createRealtor, updateRealtor, deleteRealtor,
│                                #   assignRealtor, unassignRealtor, uploadRealtorImage
├── components/
│   ├── realtors/
│   │   └── RealtorCard.tsx      # RSC 표현 컴포넌트 (D-05)
│   └── admin/
│       └── RealtorAdminActions.tsx  # 'use client' — 삭제/수정 버튼
└── app/
    └── admin/
        └── realtors/
            ├── page.tsx         # 목록 + 인라인 배정 UI (D-04)
            ├── new/
            │   └── page.tsx     # 등록 폼
            └── [id]/
                └── edit/
                    └── page.tsx  # 수정 폼
```

### 데이터 흐름 (단지 상세 페이지)
```
ComplexDetailPage (RSC)
  └─► createReadonlyClient()
  └─► getRealtorsByComplexId(complexId, supabase)
        └─► realtors JOIN realtor_assignments
              WHERE complex_id = ? AND is_active = true
              ORDER BY display_order ASC
  └─► realtors.length > 0 ? <RealtorSection> : null
        └─► <RealtorCard realtor={r} />  × max 2
              └─► 이름, 상호, 전화(tel:), 소개, 이미지/이니셜아바타
```

### 데이터 흐름 (어드민 CRUD)
```
/admin/realtors (RSC)
  └─► createSupabaseAdminClient()    ← RLS 우회
  └─► getAllRealtors(adminClient)    ← is_active 무관 전체
  └─► getAllAssignments(adminClient) ← 단지 배정 현황
  └─► <RealtorList>
        └─► <RealtorAdminActions>    ← 'use client'
              └─► deleteRealtor(id) → Server Action
              └─► redirect('/admin/realtors/[id]/edit')
  └─► <AssignmentForm>              ← RSC form + Server Action
        └─► assignRealtor(realtorId, complexId, order) → Server Action
        └─► unassignRealtor(assignmentId) → Server Action
```

---

## Don't Hand-Roll

| 문제 | 만들지 말 것 | 대신 사용 | 이유 |
|------|-------------|-----------|------|
| 관리자 인증 | 커스텀 auth 미들웨어 | `requireAdmin()` 기존 함수 | ad-actions.ts에 이미 구현됨 |
| 이미지 업로드 | 커스텀 upload API | `uploadAdImage` 복사·변형 | 5MB 제한, 스토리지 경로 등 처리 완비 |
| revalidate | 수동 캐시 무효화 | `revalidatePath('/admin/realtors')` | Next.js 내장 |
| DB write 클라이언트 | 클라이언트 컴포넌트에서 직접 쿼리 | Server Action + adminClient | CLAUDE.md CRITICAL 규칙 |
| updated_at 갱신 | 앱 레벨 timestamp | `set_updated_at()` trigger | 이미 DB 레벨에서 처리됨 |

---

## Common Pitfalls

### Pitfall 1: `realtors` join 결과 타입 추론 실패
**What goes wrong:** `supabase.from('realtor_assignments').select('*, realtors(*)')` 시 TypeScript가 `realtors`를 `unknown`으로 추론하거나, database.ts 재생성 전에는 타입 오류 발생.
**Why it happens:** database.ts가 아직 `realtors` 테이블을 모름.
**How to avoid:** Wave 1에서 database.ts 재생성 후 진행. 재생성 전에는 `realtors.ts`에 수동 인터페이스를 정의하고 `as unknown as Realtor[]` 캐스트 사용 (admin-actions.ts의 `as any` 패턴 참고).

### Pitfall 2: `createReadonlyClient()` 사용 시 RLS 적용
**What goes wrong:** `is_active=false` 인 공인중개사가 단지 상세에 노출될 수 있음 — RLS SELECT 정책이 `USING (true)`이므로 모든 row를 허용함.
**Why it happens:** RLS는 인증 기반 필터만 하고, `is_active` 필터는 앱 레벨에서 처리해야 함.
**How to avoid:** `getRealtorsByComplexId`에서 명시적으로 `is_active=true` 필터 추가 — JOIN 이후 앱 레벨 filter 또는 쿼리에 `.eq('realtors.is_active', true)` 추가.

### Pitfall 3: `UNIQUE(complex_id, display_order)` 충돌
**What goes wrong:** 같은 단지·순서에 다른 공인중개사를 배정하려 할 때 DB 에러.
**Why it happens:** UNIQUE 제약 위반.
**How to avoid:** `upsert({ onConflict: 'complex_id,display_order' })`로 INSERT OR REPLACE 처리.

### Pitfall 4: `revalidate = 86400` 단지 상세 페이지 캐시
**What goes wrong:** 어드민에서 배정을 변경해도 단지 상세 페이지가 오래된 공인중개사 정보를 보여줌.
**Why it happens:** `page.tsx`의 `export const revalidate = 86400` (24시간 ISR).
**How to avoid:** `assignRealtor`/`unassignRealtor` Server Action에서 `revalidatePath('/complexes/[complexId]')` 또는 `revalidatePath('/complexes', 'layout')`를 추가 호출한다. 단, 특정 complexId를 알아야 하므로 Server Action 파라미터에 `complexId` 포함.

### Pitfall 5: `tel:` 형식 — 하이픈 처리
**What goes wrong:** 전화번호가 `010-1234-5678` 형식으로 저장돼 있을 때 `tel:010-1234-5678`은 브라우저에 따라 오동작할 수 있음.
**Why it happens:** `tel:` URI 스킴은 숫자와 `+` 외 하이픈도 허용하지만, 일부 환경에서 다를 수 있음.
**How to avoid:** `href={`tel:${phone.replace(/[^0-9+]/g, '')}`}` — 숫자만 남기거나 표준 포맷을 따름. D-07(단순 `<a href="tel:...">`만 지정)이므로 최소한 DB 저장 시 하이픈 정규화를 고려.

---

## Migration Details

[VERIFIED: supabase/migrations/ 파일 목록 + 기존 마이그레이션 패턴]

### 다음 마이그레이션 파일명
최신 마이그레이션: `20260527000001_phase17_ad_placement_columns.sql`
Phase 18 파일명: `20260528000001_phase18_realtors.sql`

### 마이그레이션 SQL (CONTEXT.md 기반 + 기존 패턴 적용)
```sql
-- Phase 18: 공인중개사 추천 섹션

-- 공인중개사 마스터
CREATE TABLE public.realtors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  agency_name   text NOT NULL,
  phone         text NOT NULL,
  description   text,
  license_no    text,
  image_url     text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER realtors_updated_at
  BEFORE UPDATE ON public.realtors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 단지-공인중개사 배정
CREATE TABLE public.realtor_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realtor_id     uuid NOT NULL REFERENCES public.realtors(id) ON DELETE CASCADE,
  complex_id     uuid NOT NULL REFERENCES public.complexes(id) ON DELETE CASCADE,
  display_order  smallint NOT NULL DEFAULT 1 CHECK (display_order IN (1, 2)),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(complex_id, display_order)
);

-- 조회 인덱스
CREATE INDEX idx_realtor_assignments_complex_id
  ON public.realtor_assignments(complex_id);
CREATE INDEX idx_realtor_assignments_realtor_id
  ON public.realtor_assignments(realtor_id);

-- RLS 활성화
ALTER TABLE public.realtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtor_assignments ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 (is_active 필터는 앱 레벨)
CREATE POLICY "realtors_select_all"
  ON public.realtors FOR SELECT USING (true);

CREATE POLICY "realtor_assignments_select_all"
  ON public.realtor_assignments FOR SELECT USING (true);

-- 어드민만 쓰기
CREATE POLICY "realtors_admin_write"
  ON public.realtors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "realtor_assignments_admin_write"
  ON public.realtor_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );
```

### Supabase MCP 적용 방법 (D-08)
```
mcp__supabase__apply_migration(
  project_id: "danjiondo",
  name: "phase18_realtors",
  query: <위 SQL 내용>
)
```

---

## Code Examples

### RealtorCard 컴포넌트 (RSC, D-05/D-06/D-07)
```typescript
// src/components/realtors/RealtorCard.tsx
// Source: 기존 AdBanner.tsx 구조 + 프로젝트 CSS 변수 패턴

interface RealtorCardProps {
  realtor: {
    id: string
    name: string
    agency_name: string
    phone: string
    description: string | null
    image_url: string | null
  }
}

export function RealtorCard({ realtor }: RealtorCardProps) {
  const initials = realtor.name.slice(0, 2)

  return (
    <div className="card" style={{ padding: 16, marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* 이미지 또는 이니셜 아바타 (D-06) */}
        <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
          overflow: 'hidden', background: 'var(--bg-surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {realtor.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={realtor.image_url} alt={realtor.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
              {initials}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '700 14px/1.3 var(--font-sans)', marginBottom: 2 }}>
            {realtor.name}
          </div>
          <div style={{ font: '500 12px/1.3 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6 }}>
            {realtor.agency_name}
          </div>
          {realtor.description && (
            <div style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)',
              marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {realtor.description}
            </div>
          )}
          {/* tel: 링크 (D-07) */}
          <a
            href={`tel:${realtor.phone.replace(/[^0-9+]/g, '')}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 12px', borderRadius: 6,
              background: 'var(--dj-orange)', color: '#fff',
              font: '600 12px/1 var(--font-sans)', textDecoration: 'none' }}
          >
            전화 문의 {realtor.phone}
          </a>
        </div>
      </div>
    </div>
  )
}
```

### getRealtorsByComplexId (JOIN 패턴)
```typescript
// Source: ads.ts getActiveAds 구조 + Supabase nested select 패턴
export async function getRealtorsByComplexId(
  complexId: string,
  supabase: SupabaseClient<Database>,
): Promise<Realtor[]> {
  const { data, error } = await supabase
    .from('realtor_assignments')
    .select('display_order, realtors!inner(*)')
    .eq('complex_id', complexId)
    .eq('realtors.is_active', true)
    .order('display_order', { ascending: true })

  if (error || !data) return []

  return data
    .map(row => (row as { realtors: Realtor }).realtors)
    .filter((r): r is Realtor => r !== null)
}
```

> **주의:** `realtors!inner(*)` + `.eq('realtors.is_active', true)`는 PostgREST v12+에서 동작. 프로젝트 Supabase 버전이 지원하지 않으면 앱 레벨 `.filter(r => r.is_active)` 대체.

---

## Validation Architecture

`workflow.nyquist_validation: true` 설정에 따라 포함.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (happy-dom) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test -- src/lib/data/realtors.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File |
|-----|----------|-----------|-------------------|------|
| Wave 1-01 | `getRealtorsByComplexId`: 배정 공인중개사 반환 | unit | `npm run test -- src/lib/data/realtors.test.ts` | Wave 0 gap |
| Wave 1-02 | `getRealtorsByComplexId`: is_active=false 제외 | unit | 동일 | Wave 0 gap |
| Wave 1-03 | `getRealtorsByComplexId`: 단지에 배정 없으면 빈 배열 | unit | 동일 | Wave 0 gap |
| Wave 1-04 | `createRealtor`: 필수 필드 누락 시 error 반환 | unit | `npm run test -- src/lib/auth/realtor-actions.test.ts` | Wave 0 gap |
| Wave 3-01 | `RealtorCard`: phone 렌더링 (tel: 링크) | unit | `npm run test -- src/components/realtors/RealtorCard.test.tsx` | Wave 0 gap |

### Wave 0 Gaps
- [ ] `src/lib/data/realtors.test.ts` — Supabase mock 사용 (gap-label.test.ts 패턴)
- [ ] `src/lib/auth/realtor-actions.test.ts` — requireAdmin mock 포함
- [ ] `src/components/realtors/RealtorCard.test.tsx` — 기본 렌더링 + tel: href 검증

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireAdmin()` — 기존 함수 재사용 |
| V4 Access Control | yes | RLS admin-only write 정책 (CLAUDE.md CRITICAL) |
| V5 Input Validation | yes | Server Action 필드 타입 체크, 필수값 검증 |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 인증 없이 공인중개사 생성 | Elevation of Privilege | `requireAdmin()` — `profiles.role` 체크 |
| RLS 우회 클라이언트 쿼리 | Elevation of Privilege | Server Action에서만 adminClient 사용 |
| 이미지 업로드 악용 | Tampering | 5MB 제한 + MIME 타입 검증 (uploadAdImage 패턴 동일) |
| inactive 공인중개사 노출 | Information Disclosure | `is_active=true` 앱 레벨 필터 필수 |

---

## Environment Availability

Step 2.6: SKIPPED (외부 의존성 없음 — Supabase MCP 연결 기존 설정 완료, 신규 CLI 도구 불필요)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `realtors!inner(*)`의 `.eq('realtors.is_active', true)` PostgREST 필터가 현재 Supabase 버전에서 동작 | Code Examples | 앱 레벨 `.filter(r => r.is_active)` 대체 — 낮은 위험 |
| A2 | `realtor-images` 신규 버킷이 MCP `apply_migration` SQL 내에서 `INSERT INTO storage.buckets`로 생성 가능 | Q6 이미지 | Supabase Dashboard에서 수동 버킷 생성 필요 — 낮은 위험 |

**위험도 모두 LOW — 대체 방법이 명확함.**

---

## Open Questions (RESOLVED)

1. **is_active 필터 위치 (PostgREST vs 앱 레벨)** — RESOLVED: 앱 레벨 필터 사용
   - What we know: PostgREST의 외래 테이블 필터(`realtors.is_active=true`)는 버전에 따라 동작이 다를 수 있음
   - Decision: 앱 레벨 `.filter(r => r.is_active)` 사용. PostgREST 버전 의존성 우회, 항상 동작함. Plan 18-01 구현에 반영됨.

2. **단지 배정 UI — 단지 수 vs 500 limit** — RESOLVED: `.limit(5000)` + 클라이언트 텍스트 필터
   - What we know: 재건축 어드민은 `.limit(500)` select 방식 사용. 창원·김해 실제 단지 수는 ~670개(complexes 테이블 확인).
   - Decision: `.limit(5000)` 사용 (670개 단지는 충분히 커버). 클라이언트 `<input>` + JavaScript 텍스트 매칭으로 검색 UX 제공. debounced ILIKE Server Action 불필요. Plan 18-02 구현에 반영됨.

---

## Sources

### Primary (HIGH confidence)
- `src/app/complexes/[id]/page.tsx` — in_feed 섹션 정확한 코드 위치 확인
- `src/lib/auth/ad-actions.ts` — requireAdmin, uploadAdImage, createAdCampaign 패턴
- `src/lib/data/ads.ts` — 데이터 레이어 함수 패턴
- `src/components/admin/AdCreateForm.tsx` — 어드민 폼 UI 패턴
- `src/app/admin/ads/page.tsx` — 어드민 목록 + 액션 패턴
- `src/app/admin/redevelopment/page.tsx` — 단지 전체 로드 + Server Action 인라인 패턴
- `src/lib/data/complex-search.ts` — searchComplexes 함수 시그니처
- `src/types/database.ts` — 타입 시스템 구조
- `supabase/migrations/*.sql` — 마이그레이션 패턴, set_updated_at trigger, RLS admin-only 패턴
- `vitest.config.ts` + `src/lib/data/gap-label.test.ts` — 테스트 패턴

---

## Metadata

**Confidence breakdown:**
- DB 마이그레이션 SQL: HIGH — 기존 패턴과 CONTEXT.md 명세 기반
- Server Actions 패턴: HIGH — ad-actions.ts 직접 확인
- 데이터 레이어 패턴: HIGH — ads.ts 직접 확인
- in_feed 제거 코드 위치: HIGH — page.tsx line-by-line 확인
- 어드민 구조: HIGH — 모든 admin page.tsx 파일 확인
- PostgREST 필터 동작: MEDIUM — A1 assumed 항목

**Research date:** 2026-05-26
**Valid until:** 2026-06-26 (Next.js/Supabase 변경 시 재검토)
