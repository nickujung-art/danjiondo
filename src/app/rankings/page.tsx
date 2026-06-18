import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import {
  getRecentDailyFeed,
  getRegionalPriceRanking,
  getChampionComplexes,
  getWeeklyHighlights,
  REGION_TABS,
} from '@/lib/data/rankings-page'
import type { ChampionComplexes, WeeklyHighlights } from '@/lib/data/rankings-page'
import { formatPrice, complexHref, formatPyeong } from '@/lib/format'
import { UserMenu } from '@/components/auth/UserMenu'

export const revalidate = 3600  // D-01: ISR 1시간

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'

interface Props {
  searchParams: Promise<{ date?: string; region?: string }>
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { date } = await searchParams
  const today = new Date().toISOString().split('T')[0]!
  const displayDate = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : today

  const supabase = createReadonlyClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: topTx } = await (supabase as any)
    .from('transactions')
    .select('price, area_m2, complexes(canonical_name)')
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_date', displayDate)
    .order('price', { ascending: false })
    .limit(1)
    .maybeSingle()

  const topComplex = topTx != null
    ? (Array.isArray((topTx as Record<string, unknown>)['complexes'])
        ? ((topTx as Record<string, unknown>)['complexes'] as Record<string, unknown>[])[0]
        : (topTx as Record<string, unknown>)['complexes'] as Record<string, unknown> | null)
    : null
  const ogDesc = topTx != null
    ? `${displayDate} 최고가: ${(topComplex?.['canonical_name'] as string) ?? ''} ${Math.round((topTx as Record<string, unknown>)['area_m2'] as number)}㎡ ${formatPrice((topTx as Record<string, unknown>)['price'] as number)}`
    : '창원·김해 아파트 실거래 랭킹 — 신고가·대장단지·지역순위'

  return {
    title: `${displayDate} 창원·김해 실거래 랭킹 | 단지온도`,
    description: ogDesc,
    openGraph: {
      title:       `[${displayDate}] 창원·김해 실거래 TOP 10`,
      description: ogDesc,
      url:         `${SITE}/rankings`,
      siteName:    '단지온도',
      locale:      'ko_KR',
      type:        'website',
    },
    alternates: { canonical: `${SITE}/rankings` },
  }
}

export default async function RankingsPage({ searchParams }: Props) {
  const { date: rawDate, region: rawRegion } = await searchParams

  const today = new Date().toISOString().split('T')[0]!
  const validDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - i * 86_400_000)
    return d.toISOString().split('T')[0]!
  })
  const activeDate = (typeof rawDate === 'string' && validDates.includes(rawDate))
    ? rawDate
    : today

  const validRegionKeys = REGION_TABS.map(t => t.key)
  const activeRegion = (typeof rawRegion === 'string' && validRegionKeys.includes(rawRegion as (typeof REGION_TABS)[number]['key']))
    ? rawRegion as (typeof REGION_TABS)[number]['key']
    : 'all'
  const activeTab = REGION_TABS.find(t => t.key === activeRegion) ?? REGION_TABS[0]!

  const supabase = createReadonlyClient()
  const [champions, feed, ranking, highlights] = await Promise.all([
    getChampionComplexes(supabase).catch((): ChampionComplexes => ({ chanwon: null, masan: null, gimhae: null })),
    getRecentDailyFeed(supabase, 7).catch(() => []),
    getRegionalPriceRanking(supabase, [...activeTab.sggCodes]).catch(() => []),
    getWeeklyHighlights(supabase).catch((): WeeklyHighlights => ({ topPriceThisWeek: [], topVolumeThisMonth: [], priceSurgeLastMonth: [] })),
  ])

  const activeDateFeed = feed.find(g => g.date === activeDate)

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-block',
    padding: '5px 12px',
    borderRadius: 6,
    font: '500 12px/1 var(--font-sans)',
    textDecoration: 'none',
    background: active ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
    color: active ? '#fff' : 'var(--fg-sec)',
    border: '1px solid var(--line-subtle)',
    whiteSpace: 'nowrap' as const,
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>

      {/* 헤더 */}
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
          <Link href="/presale" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>분양</Link>
          <Link href="/favorites" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>관심단지</Link>
          <Link href="/rankings" style={{ color: 'var(--dj-orange)', textDecoration: 'none' }}>랭킹</Link>
        </nav>
        <div style={{ marginLeft: 'auto' }}>
          <Suspense><UserMenu /></Suspense>
        </div>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 32px' }}>

        <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: '0 0 24px' }}>
          오늘의 실거래 랭킹
        </h1>

        {/* ── 섹션 1: 대장단지 (D-05) ── */}
        <section aria-labelledby="champion-heading" style={{ marginBottom: 32 }}>
          <h2
            id="champion-heading"
            style={{ font: '700 16px/1.3 var(--font-sans)', margin: '0 0 12px', letterSpacing: '-0.01em' }}
          >
            지역 대장단지
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {([
              { label: '창원 대장', data: champions.chanwon },
              { label: '마산 대장', data: champions.masan },
              { label: '김해 대장', data: champions.gimhae },
            ] as const).map(({ label, data }) => (
              <div key={label} className="card" style={{ padding: 16 }}>
                <p style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 6px' }}>
                  {label}
                </p>
                {data ? (
                  <>
                    <Link
                      href={complexHref(data.complexId, data.urlSlug)}
                      style={{ font: '700 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none', display: 'block', marginBottom: 8 }}
                    >
                      {data.complexName}
                    </Link>
                    <p style={{ font: '700 16px/1 var(--font-sans)', color: 'var(--dj-orange)', margin: '0 0 4px' }}>
                      {data.avgPricePerPyeong.toLocaleString()}만/평
                    </p>
                    {data.priceChange30d != null && (
                      <p style={{ font: '500 12px/1 var(--font-sans)', color: data.priceChange30d >= 0 ? '#16a34a' : '#dc2626', margin: '0 0 4px' }}>
                        {data.priceChange30d >= 0 ? '+' : ''}{(data.priceChange30d * 100).toFixed(1)}% (전월비)
                      </p>
                    )}
                    <p style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                      90일 거래 {data.txCount90d}건 · {[data.si, data.gu].filter(Boolean).join(' ')}
                    </p>
                  </>
                ) : (
                  <p style={{ font: '400 13px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                    최근 거래 없음
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── 섹션 2: 일별 실거래 피드 (D-02, D-03, D-08) ── */}
        <section aria-labelledby="feed-heading" style={{ marginBottom: 32 }}>
          <h2
            id="feed-heading"
            style={{ font: '700 16px/1.3 var(--font-sans)', margin: '0 0 12px', letterSpacing: '-0.01em' }}
          >
            일별 실거래 피드
          </h2>

          {/* 날짜 탭 */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
            {validDates.map(d => (
              <Link key={d} href={`/rankings?date=${d}&region=${activeRegion}`} style={tabStyle(d === activeDate)}>
                {d.slice(5).replace('-', '.')}
              </Link>
            ))}
          </div>

          {/* 카페 공유 버튼 (D-08) */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
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

          {/* 거래 테이블 */}
          {!activeDateFeed || activeDateFeed.transactions.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ font: '500 14px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                {activeDate} — 창원·김해 아파트 거래가 없었습니다.
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
                  {activeDateFeed.transactions.map(tx => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <Link
                          href={complexHref(tx.complexId, tx.urlSlug)}
                          style={{ font: '600 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none' }}
                        >
                          {tx.complexName}
                        </Link>
                        {tx.dong && (
                          <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginLeft: 6 }}>
                            {tx.dong}
                          </span>
                        )}
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
                        {formatPyeong(tx.area_m2)} ({tx.area_m2.toFixed(0)}㎡)
                      </td>
                      <td className="tnum" style={{ padding: '10px 12px', font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)', whiteSpace: 'nowrap' }}>
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
        </section>

        {/* ── 섹션 3: 지역 랭킹 (D-04) ── */}
        <section aria-labelledby="ranking-heading" style={{ marginBottom: 32 }}>
          <h2
            id="ranking-heading"
            style={{ font: '700 16px/1.3 var(--font-sans)', margin: '0 0 12px', letterSpacing: '-0.01em' }}
          >
            지역 평당가 랭킹
          </h2>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
            {REGION_TABS.map(tab => (
              <Link
                key={tab.key}
                href={`/rankings?date=${activeDate}&region=${tab.key}`}
                style={tabStyle(tab.key === activeRegion)}
              >
                {tab.label}
              </Link>
            ))}
          </div>
          {ranking.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <p style={{ font: '500 13px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                해당 지역 최근 30일 거래 데이터가 없습니다.
              </p>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--line-default)' }}>
                    {['#', '단지명', '평당가', '최근거래가', '30일거래'].map(h => (
                      <th
                        key={h}
                        style={{ padding: '8px 12px', font: '600 11px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: h === '#' || h === '30일거래' ? 'center' : 'left', whiteSpace: 'nowrap' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.map(row => (
                    <tr key={row.complexId} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                      <td className="tnum" style={{ padding: '10px 12px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', textAlign: 'center', width: 36 }}>
                        {row.rank}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Link
                          href={complexHref(row.complexId, row.urlSlug)}
                          style={{ font: '600 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none' }}
                        >
                          {row.complexName}
                        </Link>
                        {(row.si ?? row.gu) && (
                          <div style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 2 }}>
                            {[row.si, row.gu].filter(Boolean).join(' ')}
                          </div>
                        )}
                      </td>
                      <td className="tnum" style={{ padding: '10px 12px', font: '700 14px/1 var(--font-sans)', color: 'var(--dj-orange)', whiteSpace: 'nowrap' }}>
                        {row.avgPricePerPyeong.toLocaleString()}만/평
                      </td>
                      <td className="tnum" style={{ padding: '10px 12px', font: '500 13px/1 var(--font-sans)', whiteSpace: 'nowrap' }}>
                        {row.recentTradePrice != null ? formatPrice(row.recentTradePrice) : '—'}
                      </td>
                      <td className="tnum" style={{ padding: '10px 12px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', textAlign: 'center' }}>
                        {row.txCount30d}건
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── 섹션 4: 이번 주 흥미 지표 (D-06) ── */}
        <section aria-labelledby="highlights-heading" style={{ marginBottom: 40 }}>
          <h2
            id="highlights-heading"
            style={{ font: '700 16px/1.3 var(--font-sans)', margin: '0 0 16px', letterSpacing: '-0.01em' }}
          >
            이번 주 흥미 지표
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

            {/* 이번 주 최고가 TOP 3 */}
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ font: '600 13px/1.3 var(--font-sans)', margin: '0 0 10px', color: 'var(--fg-pri)' }}>
                이번 주 최고가 TOP 3
              </h3>
              {highlights.topPriceThisWeek.length === 0 ? (
                <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>데이터 없음</p>
              ) : highlights.topPriceThisWeek.map((item, idx) => (
                <div key={item.complexId} style={{ marginBottom: idx < highlights.topPriceThisWeek.length - 1 ? 10 : 0 }}>
                  <span style={{ font: '600 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginRight: 6 }}>{idx + 1}</span>
                  <Link href={complexHref(item.complexId, item.urlSlug)} style={{ font: '600 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none' }}>
                    {item.complexName}
                  </Link>
                  <div style={{ font: '700 14px/1 var(--font-sans)', color: 'var(--dj-orange)', margin: '3px 0 2px' }}>
                    {formatPrice(item.price)}
                  </div>
                  <div style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                    {formatPyeong(item.area_m2)} · {item.deal_date.slice(5).replace('-', '.')}
                  </div>
                </div>
              ))}
            </div>

            {/* 이번 달 거래량 TOP 5 */}
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ font: '600 13px/1.3 var(--font-sans)', margin: '0 0 10px', color: 'var(--fg-pri)' }}>
                이번 달 거래량 TOP 5
              </h3>
              {highlights.topVolumeThisMonth.length === 0 ? (
                <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>데이터 없음</p>
              ) : highlights.topVolumeThisMonth.map((item, idx) => (
                <div
                  key={item.complexId}
                  style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: idx < highlights.topVolumeThisMonth.length - 1 ? 8 : 0 }}
                >
                  <span style={{ font: '600 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', minWidth: 14 }}>{idx + 1}</span>
                  <Link href={complexHref(item.complexId, item.urlSlug)} style={{ font: '600 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none', flex: 1 }}>
                    {item.complexName}
                  </Link>
                  <span className="tnum" style={{ font: '700 14px/1 var(--font-sans)', color: 'var(--dj-orange)', whiteSpace: 'nowrap' }}>
                    {item.txCount30d}건
                  </span>
                </div>
              ))}
            </div>

            {/* 전월 대비 급등 TOP 3 */}
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ font: '600 13px/1.3 var(--font-sans)', margin: '0 0 10px', color: 'var(--fg-pri)' }}>
                전월 대비 급등 TOP 3
              </h3>
              <p style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 8px' }}>
                평당가 20% 이상 상승 단지
              </p>
              {highlights.priceSurgeLastMonth.length === 0 ? (
                <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>해당 단지 없음</p>
              ) : highlights.priceSurgeLastMonth.map((item, idx) => (
                <div key={item.complexId} style={{ marginBottom: idx < highlights.priceSurgeLastMonth.length - 1 ? 10 : 0 }}>
                  <span style={{ font: '600 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginRight: 6 }}>{idx + 1}</span>
                  <Link href={complexHref(item.complexId, item.urlSlug)} style={{ font: '600 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none' }}>
                    {item.complexName}
                  </Link>
                  <div style={{ font: '700 14px/1 var(--font-sans)', color: '#16a34a', margin: '3px 0 0' }}>
                    +{(item.changeRatio * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>

          </div>
        </section>

        <p style={{ font: '400 11px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 16 }}>
          국토부 실거래 기준 · deal_type=sale · 매일 새벽 갱신
        </p>

      </main>

      {/* 하단 카페 CTA (D-08) */}
      <footer style={{ borderTop: '1px solid var(--line-default)', background: '#fff', padding: '16px 32px', textAlign: 'center' }}>
        <a
          href="https://cafe.naver.com/xxdkd"
          target="_blank"
          rel="noopener noreferrer"
          style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--dj-orange)', textDecoration: 'none' }}
        >
          창원부동산이야기 카페에서 더 많은 정보 보기
        </a>
      </footer>

    </div>
  )
}
