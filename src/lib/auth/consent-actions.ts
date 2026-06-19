'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * LEGAL-01: 이용약관·개인정보처리방침 동의 (D-10, D-12, D-13)
 * /consent 페이지에서 호출.
 *
 * RLS Pitfall 2: profiles 테이블의 owner update 정책에 `with check (role in ('user'))` 포함.
 * admin role 사용자는 일반 client로 자신의 profile을 업데이트할 수 없으므로
 * 모든 profiles UPDATE는 createSupabaseAdminClient() 경유 필수.
 * (RESEARCH.md 라인 325-368, PATTERNS.md 라인 417-468)
 */
export async function agreeToTerms(
  formData: FormData,
): Promise<{ error: string | null }> {
  const terms   = formData.get('terms')   === 'on'
  const privacy = formData.get('privacy') === 'on'
  const rawNext = (formData.get('next') as string | null) ?? '/'
  const next    = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

  if (!terms || !privacy) {
    return { error: '이용약관과 개인정보처리방침에 모두 동의해야 합니다.' }
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const adminClient = createSupabaseAdminClient()
  const { error } = await adminClient
    .from('profiles')
    .update({ terms_agreed_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/consent')
  redirect(next)
}

/**
 * LEGAL-04: 계정 탈퇴 (D-06) — soft delete + signOut.
 * 30일 grace 기간 후 Vercel cron이 hard delete 처리.
 *
 * RLS Pitfall 2: profiles UPDATE는 admin client 경유 필수.
 */
export async function deleteAccount(): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const adminClient = createSupabaseAdminClient()
  const { error } = await adminClient
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return { error: error.message }

  // 세션 종료 (서버 사이드)
  await supabase.auth.signOut()
  redirect('/')
}

/**
 * LEGAL-04: 계정 재활성화 (D-06) — /reactivate 페이지에서 호출.
 * 30일 이내 deleted_at을 NULL로 복구.
 *
 * RLS Pitfall 2: profiles UPDATE는 admin client 경유 필수.
 */
export async function reactivateAccount(): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const adminClient = createSupabaseAdminClient()
  const { error } = await adminClient
    .from('profiles')
    .update({ deleted_at: null })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/')
  redirect('/')
}
