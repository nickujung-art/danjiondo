# Phase 18: Realtor Recommendation - Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 11 new/modified files
**Analogs found:** 11 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/20260528000001_phase18_realtors.sql` | migration | CRUD | `supabase/migrations/20260522000001_phase15_tier_extension.sql` | exact |
| `src/types/database.ts` | config | — | self (append new table blocks) | exact |
| `src/lib/data/realtors.ts` | service | CRUD | `src/lib/data/ads.ts` | exact |
| `src/lib/auth/realtor-actions.ts` | service | request-response | `src/lib/auth/ad-actions.ts` | exact |
| `src/app/admin/realtors/page.tsx` | route (RSC) | request-response | `src/app/admin/ads/page.tsx` | exact |
| `src/app/admin/realtors/new/page.tsx` | route (RSC) | request-response | `src/app/admin/ads/new/page.tsx` | exact |
| `src/app/admin/realtors/[id]/edit/page.tsx` | route (RSC) | request-response | `src/app/admin/ads/[id]/edit/page.tsx` | exact |
| `src/components/admin/RealtorCreateForm.tsx` | component | request-response | `src/components/admin/AdCreateForm.tsx` | exact |
| `src/components/admin/RealtorEditForm.tsx` | component | request-response | `src/components/admin/AdEditForm.tsx` | exact |
| `src/components/admin/RealtorActions.tsx` | component | event-driven | `src/components/ads/AdminCampaignActions.tsx` | exact |
| `src/app/complexes/[id]/page.tsx` (modified) | route (RSC) | request-response | self | exact |

---

## Pattern Assignments

### `supabase/migrations/20260528000001_phase18_realtors.sql` (migration)

**Analog:** `supabase/migrations/20260522000001_phase15_tier_extension.sql` (lines 173–201)

**Table creation pattern:**
```sql
-- CRITICAL: ALL user-data tables MUST have RLS policies (CLAUDE.md)
CREATE TABLE IF NOT EXISTS public.realtors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  agency_name  text NOT NULL,
  phone        text NOT NULL,
  license_no   text,
  profile_url  text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.realtor_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realtor_id   uuid NOT NULL REFERENCES public.realtors(id) ON DELETE CASCADE,
  complex_id   uuid NOT NULL REFERENCES public.complexes(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (realtor_id, complex_id)
);

CREATE INDEX IF NOT EXISTS realtor_assignments_complex_idx
  ON public.realtor_assignments (complex_id);

ALTER TABLE public.realtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtor_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT: public (realtors are public directory info)
CREATE POLICY "realtors: public read"
  ON public.realtors FOR SELECT USING (true);

CREATE POLICY "realtor_assignments: public read"
  ON public.realtor_assignments FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE: service_role only (via Server Actions using admin client)
-- service_role bypasses RLS — no additional policies needed for writes
```

**Key constraints:**
- `UNIQUE (realtor_id, complex_id)` prevents duplicate assignments
- Index on `complex_id` is critical for the detail page join query
- Always `ENABLE ROW LEVEL SECURITY` before creating policies
- Write operations use `createSupabaseAdminClient()` in Server Actions — no RLS write policy needed

---

### `src/types/database.ts` (config — append only)

**Analog:** `src/types/database.ts` lines 37–101 (`ad_campaigns` block)

**Table type block pattern** (append inside `public.Tables`):
```typescript
realtors: {
  Row: {
    id: string
    name: string
    agency_name: string
    phone: string
    license_no: string | null
    profile_url: string | null
    is_active: boolean
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    name: string
    agency_name: string
    phone: string
    license_no?: string | null
    profile_url?: string | null
    is_active?: boolean
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    name?: string
    agency_name?: string
    phone?: string
    license_no?: string | null
    profile_url?: string | null
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
    created_at: string
  }
  Insert: {
    id?: string
    realtor_id: string
    complex_id: string
    created_at?: string
  }
  Update: {
    id?: string
    realtor_id?: string
    complex_id?: string
    created_at?: string
  }
  Relationships: [
    {
      foreignKeyName: "realtor_assignments_realtor_id_fkey"
      columns: ["realtor_id"]
      isOneToOne: false
      referencedRelation: "realtors"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "realtor_assignments_complex_id_fkey"
      columns: ["complex_id"]
      isOneToOne: false
      referencedRelation: "complexes"
      referencedColumns: ["id"]
    },
  ]
}
```

Note: After running migrations, regenerate with `npx supabase gen types typescript` rather than hand-editing, but the structure above is what the generator produces.

---

### `src/lib/data/realtors.ts` (service, CRUD)

**Analog:** `src/lib/data/ads.ts` (full file, 109 lines)

**Imports pattern** (lines 1–3 of ads.ts):
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type Realtor = Database['public']['Tables']['realtors']['Row']
export type RealtorAssignment = Database['public']['Tables']['realtor_assignments']['Row']
```

**Read functions pattern** (lines 89–109 of ads.ts):
```typescript
export async function getRealtorsByComplex(
  complexId: string,
  supabase: SupabaseClient<Database>,
): Promise<Realtor[]> {
  const { data } = await supabase
    .from('realtor_assignments')
    .select('realtors(*)')
    .eq('complex_id', complexId)
    .eq('realtors.is_active', true)
  // unwrap joined rows
  return (data ?? []).flatMap(r => r.realtors ? [r.realtors as Realtor] : [])
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

export async function getRealtorById(
  id: string,
  supabase: SupabaseClient<Database>,
): Promise<Realtor | null> {
  const { data } = await supabase
    .from('realtors')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data ?? null
}

export async function getAssignmentsByRealtor(
  realtorId: string,
  supabase: SupabaseClient<Database>,
): Promise<RealtorAssignment[]> {
  const { data } = await supabase
    .from('realtor_assignments')
    .select('*')
    .eq('realtor_id', realtorId)
  return data ?? []
}
```

**Key constraints:**
- All functions receive `supabase: SupabaseClient<Database>` — never create clients inside data functions
- `maybeSingle()` for single-row lookups (not `.single()` which throws on missing row)
- Return `data ?? []` or `data ?? null` — never throw from data layer for missing data

---

### `src/lib/auth/realtor-actions.ts` (service, request-response)

**Analog:** `src/lib/auth/ad-actions.ts` (full file, 205 lines)

**File header + requireAdmin pattern** (lines 1–50 of ad-actions.ts):
```typescript
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { Database } from '@/types/database'

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

**Create action pattern** (lines 95–154 of ad-actions.ts):
```typescript
export async function createRealtor(
  formData: FormData,
): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const name = formData.get('name')
  const officeName = formData.get('agency_name')
  const phone = formData.get('phone')
  const licenseNo = formData.get('license_no')
  const profileUrl = formData.get('profile_url')

  if (
    typeof name !== 'string' || !name.trim() ||
    typeof officeName !== 'string' || !officeName.trim() ||
    typeof phone !== 'string' || !phone.trim()
  ) {
    return { error: '필수 항목을 모두 입력하세요.' }
  }

  const { error: dbErr } = await admin.from('realtors').insert({
    name: name.trim(),
    agency_name: officeName.trim(),
    phone: phone.trim(),
    license_no: typeof licenseNo === 'string' && licenseNo.trim() ? licenseNo.trim() : null,
    profile_url: typeof profileUrl === 'string' && profileUrl.trim() ? profileUrl.trim() : null,
  })

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/realtors')
  return { error: null }
}
```

**Delete action pattern** (lines 81–93 of ad-actions.ts):
```typescript
export async function deleteRealtor(id: string): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const { error: dbErr } = await admin
    .from('realtors')
    .delete()
    .eq('id', id)

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/realtors')
  return { error: null }
}
```

**Assignment actions** (new pattern, no direct analog — use same requireAdmin shell):
```typescript
export async function assignRealtorToComplex(
  realtorId: string,
  complexId: string,
): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const { error: dbErr } = await admin
    .from('realtor_assignments')
    .insert({ realtor_id: realtorId, complex_id: complexId })

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/realtors')
  return { error: null }
}

export async function removeRealtorAssignment(
  assignmentId: string,
): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const { error: dbErr } = await admin
    .from('realtor_assignments')
    .delete()
    .eq('id', assignmentId)

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/realtors')
  return { error: null }
}
```

**Key constraints:**
- `'use server'` directive at top of file — mandatory
- Always call `requireAdmin()` first in every exported action
- Return `{ error: string | null }` — never throw from Server Actions
- Call `revalidatePath('/admin/realtors')` after every mutating action

---

### `src/app/admin/realtors/page.tsx` (route, RSC)

**Analog:** `src/app/admin/ads/page.tsx` (full file, 232 lines)

**Auth guard + data fetch pattern** (lines 37–58 of admin/ads/page.tsx):
```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getAllRealtors } from '@/lib/data/realtors'

export const revalidate = 0

export default async function AdminRealtorsPage() {
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

  const adminClient = createSupabaseAdminClient()
  const realtors = await getAllRealtors(adminClient)

  return ( /* ... */ )
}
```

**Table + empty state UI pattern** (lines 124–228 of admin/ads/page.tsx):
```tsx
{realtors.length === 0 ? (
  <div
    className="card"
    style={{ padding: 40, textAlign: 'center', font: '500 14px/1.6 var(--font-sans)', color: 'var(--fg-tertiary)' }}
  >
    등록된 공인중개사가 없습니다.
  </div>
) : (
  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--line-default)', background: 'var(--bg-surface-2)' }}>
          {['이름', '사무소', '전화번호', '등록번호', '상태', '단지 배정', '액션'].map(h => (
            <th key={h} style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left', whiteSpace: 'nowrap' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {realtors.map((r, i) => (
          <tr key={r.id} style={{ borderBottom: i < realtors.length - 1 ? '1px solid var(--line-subtle)' : 'none' }}>
            {/* cells */}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

**Page header layout pattern** (lines 60–118 of admin/ads/page.tsx):
```tsx
<header style={{
  height: 60, background: '#fff', borderBottom: '1px solid var(--line-default)',
  display: 'flex', alignItems: 'center', padding: '0 32px', gap: 24,
  position: 'sticky', top: 0, zIndex: 50,
}}>
  <Link href="/" className="dj-logo"><span className="mark">단</span><span>단지온도</span></Link>
  <span style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>관리자 · 공인중개사</span>
</header>
<div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
    <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: 0 }}>
      공인중개사 관리
    </h1>
    <Link href="/admin/realtors/new" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
      background: 'var(--dj-orange)', color: '#fff', borderRadius: 8,
      font: '600 13px/1 var(--font-sans)', textDecoration: 'none', whiteSpace: 'nowrap',
    }}>
      + 새 중개사 등록
    </Link>
  </div>
  {/* table content */}
</div>
```

---

### `src/app/admin/realtors/new/page.tsx` (route, RSC)

**Analog:** `src/app/admin/ads/new/page.tsx` (full file, 93 lines)

**Exact structural pattern** — RSC performs auth guard, renders Client component form:
```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { RealtorCreateForm } from '@/components/admin/RealtorCreateForm'

export const revalidate = 0

export default async function AdminRealtorsNewPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/realtors/new')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>
      {/* header identical to ads/new/page.tsx structure */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 32px' }}>
        <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
          공인중개사 등록
        </h1>
        <RealtorCreateForm />
      </div>
    </div>
  )
}
```

---

### `src/app/admin/realtors/[id]/edit/page.tsx` (route, RSC)

**Analog:** `src/app/admin/ads/[id]/edit/page.tsx` (full file, 62 lines)

**Dynamic param + notFound pattern** (lines 10–33 of admin/ads/[id]/edit/page.tsx):
```typescript
import { redirect, notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getRealtorById, getAssignmentsByRealtor } from '@/lib/data/realtors'
import { RealtorEditForm } from '@/components/admin/RealtorEditForm'

export default async function AdminRealtorEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params    // Next.js 15: params is a Promise

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/realtors/${id}/edit`)

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  const adminClient = createSupabaseAdminClient()
  const [realtor, assignments] = await Promise.all([
    getRealtorById(id, adminClient),
    getAssignmentsByRealtor(id, adminClient),
  ])
  if (!realtor) notFound()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>
      {/* header */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 32px' }}>
        <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
          공인중개사 수정
        </h1>
        <RealtorEditForm realtor={realtor} assignments={assignments} />
      </div>
    </div>
  )
}
```

**Key constraints:**
- `params: Promise<{ id: string }>` — Next.js 15 App Router, params is async
- `Promise.all([ getRealtorById, getAssignmentsByRealtor ])` — parallel fetch
- Pass both `realtor` and `assignments` to edit form for the assignment UI

---

### `src/components/admin/RealtorCreateForm.tsx` (component, request-response)

**Analog:** `src/components/admin/AdCreateForm.tsx` (full file, 390 lines)

**File header + state pattern** (lines 1–51 of AdCreateForm.tsx):
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRealtor } from '@/lib/auth/realtor-actions'

export function RealtorCreateForm() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createRealtor(formData)
      if (result.error) setSubmitError(result.error)
      else { setSubmitSuccess(true); router.push('/admin/realtors') }
    } catch {
      setSubmitError('등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }
  // ...
}
```

**Form structure pattern** (lines 122–362 of AdCreateForm.tsx):
```tsx
return (
  <div className="card" style={{ padding: '28px 32px' }}>
    <form action={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

        <Field label="중개사 이름" required>
          <input name="name" className="input" required style={inputStyle} placeholder="홍길동" />
        </Field>

        <Field label="사무소명" required>
          <input name="agency_name" className="input" required style={inputStyle} placeholder="단지온도 부동산" />
        </Field>

        <Field label="전화번호" required>
          <input name="phone" type="tel" className="input" required style={inputStyle} placeholder="010-0000-0000" />
        </Field>

        <Field label="등록번호" hint="공인중개사 자격 번호">
          <input name="license_no" className="input" style={inputStyle} placeholder="12345-2024-00001" />
        </Field>

        <Field label="프로필 URL" hint="네이버 부동산 등 링크">
          <input name="profile_url" type="url" className="input" style={inputStyle} placeholder="https://..." />
        </Field>

        {submitError && (
          <p style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-negative)', margin: 0 }}>{submitError}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="btn btn-md btn-orange"
            disabled={isSubmitting}
            style={{ opacity: isSubmitting ? 0.5 : 1 }}
          >
            {isSubmitting ? '등록 중…' : '등록'}
          </button>
        </div>

      </div>
    </form>
  </div>
)
```

**Field helper component** (lines 368–390 of AdCreateForm.tsx — copy verbatim):
```typescript
const inputStyle: React.CSSProperties = { width: '100%', height: 40, fontSize: 14 }
const labelStyle: React.CSSProperties = { font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <label style={labelStyle}>
          {label}
          {required && <span style={{ color: 'var(--fg-negative)', marginLeft: 2 }}>*</span>}
        </label>
        {hint && <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}
```

---

### `src/components/admin/RealtorEditForm.tsx` (component, request-response)

**Analog:** `src/components/admin/AdEditForm.tsx` (full file, 385 lines)

**Prop + state initialization pattern** (lines 50–66 of AdEditForm.tsx):
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateRealtor, assignRealtorToComplex, removeRealtorAssignment } from '@/lib/auth/realtor-actions'
import type { Realtor, RealtorAssignment } from '@/lib/data/realtors'

export function RealtorEditForm({
  realtor,
  assignments,
}: {
  realtor: Realtor
  assignments: RealtorAssignment[]
}) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)
  const [isActive,     setIsActive]     = useState(realtor.is_active)
  // assignment UI state for the complex-picker section
  const [complexIdInput, setComplexIdInput] = useState('')
  const [assignError,    setAssignError]    = useState<string | null>(null)
  const [localAssignments, setLocalAssignments] = useState(assignments)

  async function handleSubmit(formData: FormData) {
    formData.set('is_active', String(isActive))
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await updateRealtor(realtor.id, formData)
      if (result.error) setSubmitError(result.error)
      else { router.push('/admin/realtors') }
    } catch {
      setSubmitError('수정 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }
  // ...
}
```

**Cancel + Save buttons pattern** (lines 340–354 of AdEditForm.tsx):
```tsx
<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
  <button
    type="button"
    className="btn btn-md"
    onClick={() => router.push('/admin/realtors')}
    style={{ background: 'var(--bg-surface-2)', color: 'var(--fg-sec)', border: '1px solid var(--line-default)' }}
  >취소</button>
  <button
    type="submit"
    className="btn btn-md btn-orange"
    disabled={isSubmitting}
    style={{ opacity: isSubmitting ? 0.5 : 1 }}
  >{isSubmitting ? '저장 중…' : '저장'}</button>
</div>
```

---

### `src/components/admin/RealtorActions.tsx` (component, event-driven)

**Analog:** `src/components/ads/AdminCampaignActions.tsx` (full file, 71 lines)

**useTransition pattern** (lines 1–20 of AdminCampaignActions.tsx):
```typescript
'use client'

import { useTransition } from 'react'
import { deleteRealtor } from '@/lib/auth/realtor-actions'

interface Props {
  id: string
  isActive: boolean
}

export function RealtorActions({ id, isActive }: Props) {
  const [pending, startTransition] = useTransition()

  function call(action: (id: string) => Promise<{ error: string | null }>) {
    startTransition(async () => {
      const result = await action(id)
      if (result.error) alert(result.error)
    })
  }

  function handleDelete() {
    if (!confirm('이 공인중개사를 삭제하면 단지 배정도 모두 삭제됩니다. 삭제하시겠습니까?')) return
    call(deleteRealtor)
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        className="btn btn-sm btn-ghost"
        style={{ fontSize: 11, color: '#dc2626' }}
        disabled={pending}
        onClick={handleDelete}
      >
        삭제
      </button>
    </div>
  )
}
```

---

### `src/app/complexes/[id]/page.tsx` (modified — replace in_feed section)

**Target section** (lines 811–832 of the file — the `inFeedAds` block in the Right rail):
```tsx
{/* 이 지역 관련 광고 — REMOVE THIS ENTIRE BLOCK */}
{inFeedAds.length > 0 && (
  <section style={{ marginTop: 32, paddingBottom: 40 }}>
    {/* ... */}
  </section>
)}
```

**Replace with** (modeled on `CafeArticlesSection` at lines 65–80 — a pure RSC section component):
```tsx
{/* 이 단지 담당 공인중개사 — NEW SECTION */}
{complexRealtors.length > 0 && (
  <section style={{ marginTop: 32, paddingBottom: 40 }}>
    <h2 style={{
      font: '600 14px/1 var(--font-sans)',
      color: 'var(--fg-sec)',
      margin: '0 0 12px',
      letterSpacing: '-0.01em',
    }}>
      이 단지 담당 공인중개사
    </h2>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {complexRealtors.map(r => (
        <RealtorCard key={r.id} realtor={r} />
      ))}
    </div>
  </section>
)}
```

**Data fetch addition** in the `Promise.all` (line 204–271 of the file):
```typescript
// Add to Promise.all destructure:
const [
  saleData,
  sidebarAds,
  /* REMOVE: inFeedAds, */
  complexRealtors,   // NEW
  reviews,
  // ... rest unchanged
] = await Promise.all([
  getComplexTransactionSummary(id, 'sale', supabase),
  getActiveAds('sidebar', supabase),
  getRealtorsByComplex(id, supabase),  // NEW — replaces getActiveAds('in_feed',...)
  getReviewsWithComments(id, supabase),
  // ... rest unchanged
])
```

**Import addition** (line 6 of the file — after existing imports):
```typescript
import { getRealtorsByComplex } from '@/lib/data/realtors'
import type { Realtor } from '@/lib/data/realtors'
```

---

## Shared Patterns

### Admin Auth Guard
**Source:** `src/lib/auth/ad-actions.ts` lines 34–50 (requireAdmin) and `src/app/admin/ads/page.tsx` lines 37–51
**Apply to:** ALL new admin route pages and ALL new Server Actions

```typescript
// In Server Actions:
const { error, admin } = await requireAdmin()
if (error || !admin) return { error: error! }

// In RSC page:
const supabase = await createSupabaseServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login?next=/admin/realtors')
const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
  redirect('/')
}
```

### Server Client Usage Rule
**Source:** CLAUDE.md architecture constraints
**Apply to:** ALL new files

- `createReadonlyClient()` — for public RSC reads (complex detail page)
- `createSupabaseServerClient()` — for auth checks in RSC pages
- `createSupabaseAdminClient()` — for admin writes and bypassing RLS
- **NEVER** import any Supabase client in Client Components (`'use client'`)

### Error Return Convention
**Source:** `src/lib/auth/ad-actions.ts` (every exported function)
**Apply to:** All Server Actions

```typescript
// Always return { error: string | null } — never throw
if (dbErr) return { error: dbErr.message }
return { error: null }
```

### revalidatePath After Mutations
**Source:** `src/lib/auth/ad-actions.ts` lines 65, 92, 152, 203–204
**Apply to:** All Server Actions that mutate data

```typescript
revalidatePath('/admin/realtors')
// For edit actions also revalidate the specific page:
revalidatePath(`/admin/realtors/${id}/edit`)
// If the complex detail page shows realtor data, also revalidate:
// revalidatePath(`/complexes/${complexId}`)  — needed for assignment changes
```

### Admin Client for Reads in Admin Pages
**Source:** `src/app/admin/ads/page.tsx` lines 54–58
**Apply to:** All admin list/edit RSC pages

```typescript
// Admin pages bypass RLS to see all records
const adminClient = createSupabaseAdminClient()
const realtors = await getAllRealtors(adminClient)
```

### export const revalidate = 0
**Source:** `src/app/admin/ads/page.tsx` line 11, `src/app/admin/ads/new/page.tsx` line 6
**Apply to:** All admin pages — prevents caching of admin data

### CSS Design System Tokens
**Source:** `src/app/admin/ads/page.tsx` throughout (class names + inline style variables)
**Apply to:** All new UI components

```
var(--font-sans)       — typography
var(--fg-pri)          — primary foreground text
var(--fg-sec)          — secondary foreground text
var(--fg-tertiary)     — tertiary/muted text
var(--fg-negative)     — error / destructive
var(--fg-positive)     — success
var(--dj-orange)       — brand accent (primary button color, active states)
var(--bg-canvas)       — page background
var(--bg-surface-2)    — card secondary background, table header
var(--line-default)    — border default
var(--line-subtle)     — border subtle (row dividers)
className="card"       — white card with border-radius and shadow
className="input"      — standard input styling
className="btn btn-md btn-orange"   — primary CTA button
className="btn btn-sm btn-ghost"    — secondary/ghost small button
```

**BANNED (from CLAUDE.md):** `backdrop-blur`, `gradient-text`, glow animations, purple/indigo brand colors, gradient orbs.

---

## No Analog Found

All Phase 18 files have close analogs. The complex assignment UI within `RealtorEditForm` (allowing admin to add/remove complex associations inline) has no exact match but follows the same `useTransition` + Server Action call pattern from `AdminCampaignActions.tsx`.

---

## Key Constraints (from CLAUDE.md)

| Constraint | Impact on Phase 18 |
|---|---|
| Supabase queries in server components or API routes ONLY | `getRealtorsByComplex` called only in `complexes/[id]/page.tsx` (RSC), never in a Client Component |
| RLS policy REQUIRED on all user-data tables | Both `realtors` and `realtor_assignments` tables must have `ENABLE ROW LEVEL SECURITY` + policies in the migration SQL |
| Server Action first | All CRUD on realtors/assignments goes through `realtor-actions.ts`, not API routes |
| No standalone name matching | Assignment links realtors to `complexes.id` (UUID), not complex name strings |
| `complexes` table is the Golden Record | `realtor_assignments.complex_id` is a FK to `complexes(id)` — never store complex name in assignment table |

---

## Metadata

**Analog search scope:** `src/lib/auth/`, `src/lib/data/`, `src/components/admin/`, `src/components/ads/`, `src/app/admin/ads/`, `src/app/complexes/[id]/`, `src/types/`, `supabase/migrations/`
**Files scanned:** 11 source files + 2 migration files
**Pattern extraction date:** 2026-05-26
