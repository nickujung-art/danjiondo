import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { RealtorCreateForm } from '@/components/admin/RealtorCreateForm'

export const revalidate = 0

export default async function AdminRealtorsNewPage() {
  // 관리자 권한 확인
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/realtors/new')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (
    !profile ||
    !['admin', 'superadmin'].includes(
      (profile as { role: string }).role ?? '',
    )
  ) {
    redirect('/')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        fontFamily: 'var(--font-sans)',
      }}
    >
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
        <span
          style={{
            font: '600 14px/1 var(--font-sans)',
            color: 'var(--fg-sec)',
          }}
        >
          관리자 · 공인중개사 등록
        </span>
        <div style={{ flex: 1 }} />
        <Link
          href="/admin/realtors"
          style={{
            font: '500 13px/1 var(--font-sans)',
            color: 'var(--fg-sec)',
            textDecoration: 'none',
          }}
        >
          ← 목록으로
        </Link>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 32px' }}>
        <h1
          style={{
            font: '700 22px/1.3 var(--font-sans)',
            letterSpacing: '-0.02em',
            margin: '0 0 20px',
          }}
        >
          공인중개사 등록
        </h1>

        <RealtorCreateForm />
      </div>
    </div>
  )
}
