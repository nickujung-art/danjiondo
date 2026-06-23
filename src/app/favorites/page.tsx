import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getFavorites } from '@/lib/data/favorites'
import { FavoritesTable } from '@/components/complex/FavoritesTable'

export const metadata: Metadata = {
  title: '관심단지 | 단지온도',
}

export const revalidate = 0

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}

export default async function FavoritesPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/favorites')

  const favorites = await getFavorites(user.id, supabase)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Nav */}
      <header
        style={{
          height: 60,
          background: '#fff',
          borderBottom: '1px solid var(--line-default)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 16,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <Link href="/" className="dj-logo">
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
        <nav style={{ display: 'flex', gap: 24, font: '600 14px/1 var(--font-sans)' }}>
          <Link href="/" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>홈</Link>
          <Link href="/map" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>지도</Link>
          <Link href="#" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>분양</Link>
          <Link href="/favorites" style={{ color: 'var(--dj-orange)', textDecoration: 'none' }}>관심단지</Link>
        </nav>
      </header>

      <div style={{ padding: '24px 16px', maxWidth: 1280, margin: '0 auto' }}>
        <h1
          style={{
            font: '700 28px/1.25 var(--font-sans)',
            letterSpacing: '-0.024em',
            margin: '0 0 4px',
          }}
        >
          관심단지
        </h1>
        <p
          style={{
            font: '500 14px/1.4 var(--font-sans)',
            color: 'var(--fg-sec)',
            margin: '0 0 24px',
          }}
        >
          {favorites.length > 0
            ? `등록한 ${favorites.length}개 단지를 한눈에 비교하세요`
            : '아직 등록한 관심단지가 없습니다'}
        </p>

        {favorites.length > 0 ? (
          <>
            <FavoritesTable favorites={favorites} />

            {/* Alert rule card */}
            <div
              className="card"
              style={{
                marginTop: 20,
                padding: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 20,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'var(--dj-orange-tint)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--dj-orange)',
                  flexShrink: 0,
                }}
              >
                <BellIcon />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{ font: '700 15px/1.4 var(--font-sans)', marginBottom: 2 }}
                >
                  관심단지 알림 규칙
                </div>
                <div
                  style={{
                    font: '500 13px/1.4 var(--font-sans)',
                    color: 'var(--fg-sec)',
                  }}
                >
                  가격 변동 ±3% 초과 시 즉시 · 신고가 갱신 즉시 · 주간 요약 (월요일 오전 9시)
                </div>
              </div>
              <button className="btn btn-md btn-secondary">규칙 편집</button>
            </div>
          </>
        ) : (
          <div
            className="card"
            style={{
              padding: '64px 32px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'var(--dj-orange-tint)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--dj-orange)',
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 4h12v17l-6-4-6 4z" />
              </svg>
            </div>
            <div
              style={{
                font: '700 18px/1.4 var(--font-sans)',
                letterSpacing: '-0.012em',
              }}
            >
              관심단지를 추가해보세요
            </div>
            <div
              style={{
                font: '500 14px/1.6 var(--font-sans)',
                color: 'var(--fg-sec)',
                maxWidth: 320,
              }}
            >
              단지 상세 페이지에서 관심단지 버튼을 눌러 추가하면
              가격 변동 알림을 받을 수 있습니다.
            </div>
            <Link href="/map" className="btn btn-md btn-orange" style={{ textDecoration: 'none', marginTop: 8 }}>
              지도에서 단지 찾기
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
