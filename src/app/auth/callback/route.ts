import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: Request): Promise<never> {
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  // 오픈 리다이렉트 방지: 내부 경로만 허용
  const raw   = searchParams.get('next') ?? '/'
  const next  = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'

  if (!code) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) redirect('/login?error=auth')

  // Phase 3 LEGAL-01/04: profiles 상태 체크
  // - deleted_at IS NOT NULL → 탈퇴 grace 기간 중 → /reactivate
  // - terms_agreed_at IS NULL → 첫 로그인 동의 미완료 → /consent
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('deleted_at, terms_agreed_at')
      .eq('id', user.id)
      .single()

    if (profile?.deleted_at) {
      redirect('/reactivate')
    }
    if (!profile?.terms_agreed_at) {
      redirect(`/consent?next=${encodeURIComponent(next)}`)
    }
  }

  redirect(next)
}
