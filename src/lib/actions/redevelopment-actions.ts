'use server'

import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

const VALID_PHASES = [
  'rumor', 'proposed', 'committee_formed', 'safety_eval',
  'designated', 'business_approval', 'construction_permit',
  'construction', 'completed', 'cancelled',
] as const

const redevelopmentSchema = z.object({
  complexId: z.string().uuid('유효한 단지 ID가 아닙니다'),
  phase: z.enum(VALID_PHASES, { message: '유효한 진행 단계가 아닙니다' }),
  notes: z.string().max(500, '비고는 500자 이하로 입력해 주세요').nullable(),
})

async function requireAdmin(): Promise<{
  error: string | null
  admin: AdminClient | null
  userId: string | null
}> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다', admin: null, userId: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    return { error: '관리자 권한이 필요합니다', admin: null, userId: null }
  }

  return { error: null, admin: createSupabaseAdminClient(), userId: user.id }
}

export async function upsertRedevelopmentProject(
  complexId: string,
  phase: string,
  notes: string | null,
): Promise<{ error: string | null }> {
  // 1. admin guard FIRST (before zod — prevents payload shape leak to unauthenticated callers)
  const { error, admin, userId } = await requireAdmin()
  if (error || !admin || !userId) return { error: error! }

  // 2. zod validation (after auth confirmed)
  const parsed = redevelopmentSchema.safeParse({ complexId, phase, notes })
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0] ?? parsed.error.flatten().fieldErrors
    const message = typeof firstIssue === 'object' && 'message' in firstIssue
      ? (firstIssue as { message: string }).message
      : '입력값이 유효하지 않습니다'
    return { error: message }
  }

  // 3. upsert (complex_id 기준 — 단지당 1개 row)
  // All DB writes MUST use createSupabaseAdminClient() — per CLAUDE.md.
  // The requireAdmin() function returns the admin client after auth verification.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbErr } = await (admin as any)
    .from('redevelopment_projects')
    .upsert(
      {
        complex_id: parsed.data.complexId,
        phase: parsed.data.phase,
        notes: parsed.data.notes,
        project_name: `재건축-${parsed.data.complexId}`,
        created_by: userId,
      },
      { onConflict: 'complex_id' },
    )

  if (dbErr) return { error: (dbErr as { message: string }).message }

  revalidatePath('/admin/redevelopment')
  revalidatePath(`/complexes/${parsed.data.complexId}`)
  return { error: null }
}

// ── Phase 13: complexes status 직접 변경 (REDV-01) ──────────────────────────

const complexStatusSchema = z.object({
  complexId:     z.string().uuid('유효한 단지 ID가 아닙니다'),
  status:        z.enum(['active', 'in_redevelopment'], { message: '유효한 상태가 아닙니다' }),
  predecessorId: z.string().uuid('유효한 이전 단지 ID가 아닙니다').nullable(),
  successorId:   z.string().uuid('유효한 신규 단지 ID가 아닙니다').nullable(),
})

/**
 * REDV-01: complexes 테이블의 status / predecessor_id / successor_id 를 직접 변경.
 * /presale Tier 2 (재건축 지정) 섹션의 데이터 입력 경로.
 * complex_status enum 중 active ↔ in_redevelopment 전환만 허용 (다른 상태는 별도 영역).
 */
export async function setComplexRedevelopmentStatus(input: {
  complexId:     string
  status:        'active' | 'in_redevelopment'
  predecessorId: string | null
  successorId:   string | null
}): Promise<{ error: string | null }> {
  // 1. admin guard FIRST (per CLAUDE.md + listing-price-actions pattern)
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  // 2. zod validation (after auth confirmed)
  const parsed = complexStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 유효하지 않습니다' }
  }

  // 3. UPDATE complexes — admin client 필수 (RLS 우회)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbErr } = await (admin as any)
    .from('complexes')
    .update({
      status:         parsed.data.status,
      predecessor_id: parsed.data.predecessorId,
      successor_id:   parsed.data.successorId,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', parsed.data.complexId)

  if (dbErr) return { error: (dbErr as { message: string }).message }

  revalidatePath('/admin/redevelopment')
  revalidatePath('/presale')
  revalidatePath(`/complexes/${parsed.data.complexId}`)
  return { error: null }
}
