import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import { getRecentDailyFeed } from '@/lib/data/rankings-page'
import { formatPrice, complexHref, formatPyeong } from '@/lib/format'
import { UserMenu } from '@/components/auth/UserMenu'
import { ShareButton } from '@/components/rankings/ShareButton'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'

interface Props {
  params: Promise<{ date: string }>
}

export async function generateStaticParams() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - i * 86_400_000)
    return { date: d.toISOString().split('T')[0]! }
  })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params
  return {
    title: `${date} 창원·김해 실거래 | 단지온도`,
    description: `${date} 창원·김해 아파트 실거래 피드. 신고가·최고가 거래 확인.`,
    openGraph: {
      title:       `[${date}] 창원·김해 실거래 피드`,
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

  const supabase  = createReadonlyClient()
  const feed      = await getRecentDailyFeed(supabase, 60, 7).catch(() => [])
  const dateGroup = feed.find(g => g.date === date)
  const pageUrl   = `${SITE}/rankings/${date}`

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>
      <header style={{
        height:       56,
        background:   '#fff',
        borderBottom: '1px solid var(--line-default)',
        display:      'flex',
        alignItems:   'center',
        padding:      '0 16px',
        gap:          20,
        position:     'sticky',
        top:          0,
        zIndex:       50,
      }}>
        <Link href="/" className="dj-logo" style={{ flexShrink: 0 }}>
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
        <nav style={{ display: 'flex', gap: 16, font: '600 13px/1 var(--font-sans)' }}>
          <Link href="/"         style={{ color: 'var(--fg-sec)',    textDecoration: 'none' }}>홈</Link>
          <Link href="/map"      style={{ color: 'var(--fg-sec)',    textDecoration: 'none' }}>지도</Link>
          <Link href="/rankings" style={{ color: 'var(--dj-orange)', textDecoration: 'none' }}>랭킹</Link>
        </nav>
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <Suspense><UserMenu /></Suspense>
        </div>
      </header>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 48px' }}>

        <div style={{ marginBottom: 12 }}>
          <Link href="/rankings" style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)', textDecoration: 'none' }}>
            ← 랭킹 전체 보기
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 20 }}>
          <h1 style={{ font: '800 20px/1.3 var(--font-sans)', letterSpacing: '-0.03em', margin: 0 }}>
            {date.slice(5).replace('-', '/')} 실거래 피드
          </h1>
          <ShareButton
            url={pageUrl}
            title={`${date} 창원·김해 실거래 | 단지온도`}
            text={dateGroup ? `${dateGroup.transactions.length}건 거래 확인` : undefined}
          />
        </div>

        {!dateGroup || dateGroup.transactions.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <p style={{ font: '500 13px/1.6 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
              {date} 창원·김해 거래 데이터가 없습니다.
            </p>
            <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '8px 0 0' }}>
              국토부 신고는 계약 후 최대 30일까지 지연될 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            {dateGroup.transactions.map((tx, idx) => (
              <div
                key={tx.id}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          10,
                  padding:      '12px 14px',
                  borderBottom: idx < dateGroup.transactions.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                }}
              >
                <span className="tnum" style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', minWidth: 20, textAlign: 'right', flexShrink: 0 }}>
                  {idx + 1}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 3 }}>
                    <Link
                      href={complexHref(tx.complexId, tx.urlSlug)}
                      style={{ font: '600 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none' }}
                    >
                      {tx.complexName}
                    </Link>
                    {tx.is_new_high && (
                      <span style={{ font: '700 10px/1 var(--font-sans)', padding: '2px 6px', borderRadius: 4, background: '#ea580c', color: '#fff', flexShrink: 0 }}>
                        신고가
                      </span>
                    )}
                  </div>
                  <p style={{ font: '400 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                    {formatPyeong(tx.area_m2)} ({tx.area_m2.toFixed(0)}㎡)
                    {tx.floor != null ? ` · ${tx.floor}층` : ''}
                    {tx.dong ? ` · ${tx.dong}` : ''}
                  </p>
                </div>

                <span className="tnum" style={{ font: '700 15px/1 var(--font-sans)', color: 'var(--fg-pri)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {formatPrice(tx.price)}
                </span>
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  )
}
