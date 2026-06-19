'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function signInWithEmail(
  email: string,
): Promise<{ error: string | null }> {
  const trimmed = email.trim()
  if (!trimmed)           return { error: '이메일을 입력해주세요' }
  if (!EMAIL_RE.test(trimmed)) return { error: '유효한 이메일 형식이 아닙니다' }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback` },
  })

  if (error) return { error: error.message }
  return { error: null }
}

export async function signInWithNaver(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider: 'naver' as any,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
    },
  })
  if (error || !data.url) redirect('/login?error=oauth')
  redirect(data.url)
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/')
}

// ── 개발 전용: 테스트 계정 빠른 로그인 ──────────────────────────────────────
// NODE_ENV=development 에서만 동작. 프로덕션 빌드에서는 즉시 에러 반환.
export async function devSignIn(
  role: 'user' | 'admin',
): Promise<{ error: string } | never> {
  if (process.env.NODE_ENV !== 'development') {
    return { error: 'dev only' }
  }

  const CREDENTIALS = {
    user:  { email: 'test@danjiondo.com',  password: 'Test1234!' },
    admin: { email: 'admin@danjiondo.com', password: 'Admin1234!' },
  } as const

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword(CREDENTIALS[role])
  if (error) return { error: error.message }
  redirect('/')
}
