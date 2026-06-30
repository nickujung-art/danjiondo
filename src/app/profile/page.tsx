import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hasPushSubscription, getFavoritesCount, getReviewsCount } from '@/lib/data/profile'
import { signOut } from '@/lib/auth/actions'
import { deleteAccount } from '@/lib/auth/consent-actions'
import { PushToggle } from '@/components/profile/PushToggle'
import { TopicToggle } from '@/components/profile/TopicToggle'
import { KakaoChannelSubscribeForm } from '@/components/profile/KakaoChannelSubscribeForm'
import { getNotificationTopics } from '@/lib/data/topics'

export const revalidate = 0

export const metadata: Metadata = { title: '내 프로필 | 단지온도' }

function formatDate(s: string) {
  const d = new Date(s)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

function UserIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/profile')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, created_at')
    .eq('id', user.id)
    .single()

  const [favCount, reviewCount, isPushSubscribed, topics] = await Promise.all([
    getFavoritesCount(user.id, supabase),
    getReviewsCount(user.id, supabase),
    hasPushSubscription(user.id, supabase),
    getNotificationTopics(user.id, supabase),
  ])

  const isAdmin = profile && ['admin', 'superadmin'].includes((profile as { role: string }).role)
  const joinedAt = (profile as { created_at: string } | null)?.created_at ?? user.created_at
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

  return (
    <div
      style={{
        minHeight:  '100vh',
        background: 'var(--bg-canvas)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 24px' }}>
        {/* Profile header */}
        <div
          className="card"
          style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}
        >
          <div
            style={{
              width:        64,
              height:       64,
              borderRadius: '50%',
              background:   'var(--dj-orange)',
              display:      'grid',
              placeItems:   'center',
              color:        '#fff',
              flexShrink:   0,
            }}
          >
            <UserIcon />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                font:         '700 18px/1.3 var(--font-sans)',
                letterSpacing: '-0.01em',
                marginBottom: 4,
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
              }}
            >
              {user.email}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  font:   '500 11px/1 var(--font-sans)',
                  color:  'var(--fg-tertiary)',
                }}
              >
                가입일 {formatDate(joinedAt)}
              </span>
              {isAdmin && (
                <span className="badge orange" style={{ fontSize: 10 }}>관리자</span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div
          className="card"
          style={{
            padding:             0,
            display:             'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            overflow:            'hidden',
            marginBottom:        16,
          }}
        >
          {[
            { label: '관심단지', value: favCount, href: '/favorites' },
            { label: '작성 후기', value: reviewCount, href: undefined },
          ].map((item, i) => (
            <div
              key={item.label}
              style={{
                padding:     '18px 20px',
                borderRight: i === 0 ? '1px solid var(--line-subtle)' : 'none',
                display:     'flex',
                flexDirection: 'column',
                gap:         4,
              }}
            >
              <span
                className="tnum"
                style={{ font: '700 24px/1 var(--font-sans)', letterSpacing: '-0.02em' }}
              >
                {item.value}
              </span>
              <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                {item.href ? (
                  <Link
                    href={item.href}
                    style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}
                  >
                    {item.label} →
                  </Link>
                ) : item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Push notification */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3
            style={{
              font:   '700 14px/1.4 var(--font-sans)',
              margin: '0 0 14px',
            }}
          >
            알림 설정
          </h3>
          <PushToggle initialSubscribed={isPushSubscribed} vapidPublicKey={vapidKey} />
          <TopicToggle initialTopics={topics} />
          <div
            style={{
              height:     1,
              background: 'var(--line-subtle)',
              margin:     '16px 0 0',
            }}
          />
          <KakaoChannelSubscribeForm />
        </div>

        {/* Admin link */}
        {isAdmin && (
          <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link
              href="/admin"
              style={{
                font:           '600 13px/1 var(--font-sans)',
                color:          'var(--dj-orange)',
                textDecoration: 'none',
              }}
            >
              어드민 대시보드 →
            </Link>
            <Link
              href="/admin/ads"
              style={{
                font:           '600 13px/1 var(--font-sans)',
                color:          'var(--fg-secondary)',
                textDecoration: 'none',
              }}
            >
              광고 관리 →
            </Link>
          </div>
        )}

        {/* Sign out */}
        <form action={signOut}>
          <button
            type="submit"
            className="btn btn-md btn-ghost"
            style={{
              width:  '100%',
              color:  '#dc2626',
              border: '1px solid rgba(220,38,38,0.3)',
            }}
          >
            로그아웃
          </button>
        </form>

        {/* 위험 구역 — 계정 탈퇴 (LEGAL-04, D-06) */}
        <div
          style={{
            marginTop:  32,
            paddingTop: 24,
            borderTop:  '1px solid var(--line-subtle)',
          }}
        >
          <h3
            style={{
              font:         '700 13px/1.3 var(--font-sans)',
              color:        '#dc2626',
              margin:       '0 0 8px',
            }}
          >
            위험 구역
          </h3>
          <p
            style={{
              font:         '500 12px/1.5 var(--font-sans)',
              color:        'var(--fg-tertiary)',
              margin:       '0 0 12px',
            }}
          >
            탈퇴 후 30일 이내에는 재활성화 가능, 이후 모든 데이터가 영구 삭제됩니다.
          </p>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <form action={deleteAccount as any}>
            <button
              type="submit"
              className="btn btn-md btn-ghost"
              style={{
                width:  '100%',
                color:  '#dc2626',
                border: '1px solid rgba(220,38,38,0.5)',
              }}
            >
              계정 탈퇴
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
