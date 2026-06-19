import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { agreeToTerms } from '@/lib/auth/consent-actions'

export const revalidate = 0
export const metadata: Metadata = { title: '서비스 이용 동의' }

interface ConsentPageProps {
  searchParams: Promise<{ next?: string }>
}

export default async function ConsentPage({ searchParams }: ConsentPageProps) {
  const { next: rawNext = '/' } = await searchParams
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/consent?next=${next}`)}`)

  // 이미 동의한 경우 next로 바로 이동
  const { data: profile } = await supabase
    .from('profiles')
    .select('terms_agreed_at')
    .eq('id', user.id)
    .single()

  if ((profile as { terms_agreed_at: string | null } | null)?.terms_agreed_at) {
    redirect(next)
  }

  return (
    <div
      style={{
        minHeight:  '100vh',
        background: 'var(--bg-canvas)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <header
        style={{
          height:       60,
          background:   '#fff',
          borderBottom: '1px solid var(--line-default)',
          display:      'flex',
          alignItems:   'center',
          padding:      '0 32px',
          gap:          24,
          position:     'sticky',
          top:          0,
          zIndex:       50,
        }}
      >
        <Link href="/" className="dj-logo">
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>
        <h1
          style={{
            font:          '700 22px/1.3 var(--font-sans)',
            letterSpacing: '-0.02em',
            marginBottom:  16,
          }}
        >
          서비스 이용 동의
        </h1>
        <p
          style={{
            font:         '500 14px/1.6 var(--font-sans)',
            color:        'var(--fg-sec)',
            marginBottom: 24,
          }}
        >
          단지온도를 이용하시려면 아래 두 항목에 모두 동의해주세요.
        </p>

        <form
          action={agreeToTerms}
          className="card"
          style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <input type="hidden" name="next" value={next} />

          <label
            style={{
              display:    'flex',
              alignItems: 'flex-start',
              gap:        10,
              font:       '500 14px/1.5 var(--font-sans)',
            }}
          >
            <input type="checkbox" name="terms" required style={{ marginTop: 3 }} />
            <span>
              <Link
                href="/legal/terms"
                target="_blank"
                style={{ color: 'var(--dj-orange)', textDecoration: 'underline' }}
              >
                이용약관
              </Link>
              에 동의합니다{' '}
              <span style={{ color: '#dc2626' }}>(필수)</span>
            </span>
          </label>

          <label
            style={{
              display:    'flex',
              alignItems: 'flex-start',
              gap:        10,
              font:       '500 14px/1.5 var(--font-sans)',
            }}
          >
            <input type="checkbox" name="privacy" required style={{ marginTop: 3 }} />
            <span>
              <Link
                href="/legal/privacy"
                target="_blank"
                style={{ color: 'var(--dj-orange)', textDecoration: 'underline' }}
              >
                개인정보처리방침
              </Link>
              에 동의합니다{' '}
              <span style={{ color: '#dc2626' }}>(필수)</span>
            </span>
          </label>

          <button
            type="submit"
            className="btn btn-md btn-primary"
            style={{ marginTop: 8 }}
          >
            동의하고 시작하기
          </button>
        </form>
      </main>
    </div>
  )
}
