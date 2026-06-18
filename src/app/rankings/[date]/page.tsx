import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import { getRecentDailyFeed } from '@/lib/data/rankings-page'
import { formatPrice, complexHref, formatPyeong } from '@/lib/format'
import { UserMenu } from '@/components/auth/UserMenu'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'

interface Props {
  params: Promise<{ date: string }>
}

// 최근 30일 SSG 생성
export async function generateStaticParams() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - i * 86_400_000)
    return { date: d.toISOString().split('T')[0]! }
  })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params
  return {
    title: `${date} 창원·김해 실거래 랭킹 | 단지온도`,
    description: `${date} 창원·김해 아파트 실거래 피드. 신고가·최고가 거래 확인.`,
    openGraph: {
      title:       `[${date}] 창원·김해 실거래 TOP 10`,
      description: `${date} 창원·김해 아파트 실거래 랭킹.`,
      url:         `${SITE}/rankings/${date}`,
      siteName:    '단지온도',
      locale:      'ko_KR',
      type:        'website',
    },
    alternates: { canonical: `${SITE}/rankings/${date}` },
  }
}

export default async function DateRankingsPage({ params }: Props) {
  const { date } = await params

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return (
      <div style={{ padding: 48, textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
        <p style={{ font: '500 14px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)' }}>유효하지 않은 날짜입니다.</p>
        <Link href="/rankings" style={{ color: 'var(--dj-orange)' }}>랭킹으로 돌아가기</Link>
      </div>
    )
  }

  const supabase = createReadonlyClient()
  const feed = await getRecentDailyFeed(supabase, 60).catch(() => [])
  const dateGroup = feed.find(g => g.date === date)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>
      <header
        style={{
          height: 60,
          background: '#fff',
          borderBottom: '1px solid var(--line-default)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          gap: 32,
          position: 'sticky',
          top: 0,
          zIndex: 50,
          flexShrink: 0,
        }}
      >
        <Link href="/" className="dj-logo">
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
        <nav style={{ display: 'flex', gap: 24, font: '600 14px/1 var(--font-sans)' }}>
          <Link href="/" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>홈</Link>
          <Link href="/map" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>지도</Link>
          <Link href="/rankings" style={{ color: 'var(--dj-orange)', textDecoration: 'none' }}>랭킹</Link>
        </nav>
        <div style={{ marginLeft: 'auto' }}>
          <Suspense><UserMenu /></Suspense>
        </div>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 32px' }}>
        <div style={{ marginBottom: 16 }}>
          <Link href="/rankings" style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)', textDecoration: 'none' }}>
            ← 랭킹 전체 보기
          </Link>
        </div>
        <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
          {date} 실거래 피드
        </h1>

        {/* 카페 공유 버튼 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <a
            href="https://cafe.naver.com/xxdkd"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '6px 14px',
              borderRadius: 6,
              font: '600 12px/1 var(--font-sans)',
              color: '#fff',
              background: '#03c75a',
              textDecoration: 'none',
            }}
          >
            카페에 공유하기
          </a>
        </div>

        {!dateGroup || dateGroup.transactions.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ font: '500 14px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
              {date} — 창원·김해 아파트 거래가 없었습니다.
            </p>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--line-default)' }}>
                  {['단지명', '전용면적', '층', '거래가', '동'].map(h => (
                    <th
                      key={h}
                      style={{ padding: '8px 12px', font: '600 11px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left', whiteSpace: 'nowrap' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dateGroup.transactions.map(tx => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <Link
                        href={complexHref(tx.complexId, tx.urlSlug)}
                        style={{ font: '600 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none' }}
                      >
                        {tx.complexName}
                      </Link>
                      {tx.is_new_high && (
                        <span
                          style={{
                            display: 'inline-block',
                            marginLeft: 6,
                            padding: '2px 6px',
                            borderRadius: 4,
                            font: '700 10px/1 var(--font-sans)',
                            background: '#ea580c',
                            color: '#fff',
                            verticalAlign: 'middle',
                          }}
                        >
                          NEW HIGH
                        </span>
                      )}
                    </td>
                    <td className="tnum" style={{ padding: '10px 12px', font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)', whiteSpace: 'nowrap' }}>
                      {formatPyeong(tx.area_m2)}
                    </td>
                    <td className="tnum" style={{ padding: '10px 12px', font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                      {tx.floor != null ? `${tx.floor}층` : '—'}
                    </td>
                    <td className="tnum" style={{ padding: '10px 12px', font: '700 14px/1 var(--font-sans)', color: 'var(--fg-pri)', whiteSpace: 'nowrap' }}>
                      {formatPrice(tx.price)}
                    </td>
                    <td style={{ padding: '10px 12px', font: '400 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                      {tx.dong ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
