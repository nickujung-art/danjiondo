'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

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

export async function suspendMember(memberId: string): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  // profiles.suspended_at은 Phase 3 마이그레이션 추가 컬럼 — database.ts 재생성 전까지 any 캐스트
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbErr } = await (admin as any)
    .from('profiles')
    .update({ suspended_at: new Date().toISOString() })
    .eq('id', memberId)

  if (dbErr) return { error: (dbErr as { message: string }).message }
  revalidatePath('/admin/members')
  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function reactivateMember(memberId: string): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbErr } = await (admin as any)
    .from('profiles')
    .update({ suspended_at: null })
    .eq('id', memberId)

  if (dbErr) return { error: (dbErr as { message: string }).message }
  revalidatePath('/admin/members')
  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function resolveReport(
  reportId: string,
  action: 'accepted' | 'rejected',
): Promise<{ error: string | null }> {
  if (action !== 'accepted' && action !== 'rejected') {
    return { error: '유효하지 않은 처리 결과입니다.' }
  }

  const { error, admin, userId } = await requireAdmin()
  if (error || !admin || !userId) return { error: error! }

  // reports 테이블은 Phase 3 마이그레이션으로 추가됨 — database.ts 재생성 전까지 any 캐스트
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbErr } = await (admin as any)
    .from('reports')
    .update({
      status: action,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reportId)

  if (dbErr) return { error: (dbErr as { message: string }).message }
  revalidatePath('/admin/reports')
  revalidatePath('/admin', 'layout')
  return { error: null }
}
