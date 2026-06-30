import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { reactivateAccount } from '@/lib/auth/consent-actions'
import { signOut } from '@/lib/auth/actions'

export const revalidate = 0
export const metadata: Metadata = { title: '계정 재활성화' }

function formatDate(s: string) {
  const d = new Date(s)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

export default async function ReactivatePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/reactivate')

  const { data: profile } = await supabase
    .from('profiles')
    .select('deleted_at')
    .eq('id', user.id)
    .single()

  const deletedAt = (profile as { deleted_at: string | null } | null)?.deleted_at

  // 탈퇴 상태가 아니면 홈으로
  if (!deletedAt) redirect('/')

  // 30일 후 hard delete 예정일
  const hardDeleteAt = new Date(
    new Date(deletedAt).getTime() + 30 * 86_400_000,
  ).toISOString()

  return (
    <div
      style={{
        minHeight:  '100vh',
        background: 'var(--bg-canvas)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>
        <h1
          style={{
            font:          '700 22px/1.3 var(--font-sans)',
            letterSpacing: '-0.02em',
            marginBottom:  16,
          }}
        >
          계정이 탈퇴 처리되었습니다
        </h1>

        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <p
            style={{
              font:         '500 14px/1.6 var(--font-sans)',
              color:        'var(--fg-sec)',
              marginBottom: 8,
            }}
          >
            탈퇴 일시: <strong>{formatDate(deletedAt)}</strong>
          </p>
          <p
            style={{
              font:  '500 14px/1.6 var(--font-sans)',
              color: 'var(--fg-sec)',
            }}
          >
            {formatDate(hardDeleteAt)}까지 재활성화하지 않으면 모든 데이터가 영구 삭제됩니다.
          </p>
        </div>

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <form action={reactivateAccount as any}>
          <button
            type="submit"
            className="btn btn-md btn-primary"
            style={{ width: '100%', marginBottom: 12 }}
          >
            계정 재활성화
          </button>
        </form>

        <form action={signOut}>
          <button
            type="submit"
            className="btn btn-md btn-ghost"
            style={{ width: '100%', color: 'var(--fg-tertiary)' }}
          >
            로그아웃 (30일 후 자동 영구 삭제)
          </button>
        </form>
      </main>
    </div>
  )
}
