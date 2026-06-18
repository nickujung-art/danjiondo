import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import {
  getRecentDailyFeed,
  getRegionalPriceRanking,
  getChampionComplexes,
  getWeeklyHighlights,
  getNewRecordCount,
  getRegionalTradingHeat,
  getRegionalAllTimeHighs,
  REGION_TABS,
} from '@/lib/data/rankings-page'
import type { RegionChampion, WeeklyHighlights, RegionalHeatRow } from '@/lib/data/rankings-page'
import { formatPrice, complexHref, formatPyeong } from '@/lib/format'
import { UserMenu } from '@/components/auth/UserMenu'
import { ShareButton } from '@/components/rankings/ShareButton'

export const revalidate = 3600

const SITE     = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'
const CAFE_URL = 'https://cafe.naver.com/xxdkd'

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

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────

function chip(active: boolean): React.CSSProperties {
  return {
    display:        'inline-block',
    padding:        '6px 12px',
    borderRadius:   20,
    font:           '600 12px/1 var(--font-sans)',
    textDecoration: 'none',
    background:     active ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
    color:          active ? '#fff' : 'var(--fg-sec)',
    border:         `1px solid ${active ? 'transparent' : 'var(--line-subtle)'}`,
    whiteSpace:     'nowrap' as const,
    flexShrink:     0,
  }
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
      <h2 style={{ font: '700 17px/1.3 var(--font-sans)', margin: 0, letterSpacing: '-0.02em' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function RankCircle({ rank }: { rank: number }) {
  const isFirst  = rank === 1
  const isTop3   = rank <= 3
  return (
    <div style={{
      width:           22,
      height:          22,
      borderRadius:    '50%',
      background:      isFirst ? 'var(--dj-orange)' : isTop3 ? 'var(--bg-surface-2)' : 'transparent',
      border:          !isFirst && !isTop3 ? '1px solid var(--line-subtle)' : 'none',
      color:           isFirst ? '#fff' : isTop3 ? 'var(--fg-sec)' : 'var(--fg-tertiary)',
      font:            '700 11px/22px var(--font-sans)',
      textAlign:       'center',
      flexShrink:      0,
      alignSelf:       'flex-start',
      marginTop:       3,
    }}>
      {rank}
    </div>
  )
}

function TradingHeatBar({ heat }: { heat: RegionalHeatRow[] }) {
  const maxCount = Math.max(...heat.map(r => r.txCount30d), 1)
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      {heat.map(({ sggCode, label, txCount30d }) => (
        <div key={sggCode} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)', minWidth: 68, flexShrink: 0 }}>
            {label}
          </span>
          <div style={{ flex: 1, height: 6, background: 'var(--bg-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height:     '100%',
              width:      `${Math.round(txCount30d / maxCount * 100)}%`,
              background: 'var(--dj-orange)',
              borderRadius: 3,
            }} />
          </div>
          <span className="tnum" style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
            {txCount30d}건
          </span>
        </div>
      ))}
      <p style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '8px 0 0' }}>
        30일 매매 거래 합산 기준
      </p>
    </div>
  )
}

// ── 페이지 ───────────────────────────────────────────────────────────────────

export default async function RankingsPage({ searchParams }: Props) {
  const { date: rawDate, region: rawRegion } = await searchParams

  const supabase = createReadonlyClient()
  const [champions, feed, highlights, newRecordCount, tradingHeat] = await Promise.all([
    getChampionComplexes(supabase).catch((): RegionChampion[] => []),
    getRecentDailyFeed(supabase, 60, 7, 20).catch(() => []),
    getWeeklyHighlights(supabase).catch((): WeeklyHighlights => ({ topPriceRecent: [], topVolumeRecent: [], priceSurgeRecent: [] })),
    getNewRecordCount(supabase).catch(() => 0),
    getRegionalTradingHeat(supabase).catch((): RegionalHeatRow[] => []),
  ])

  // 날짜 탭
  const feedDates      = feed.map(g => g.date)
  const activeDate     = feedDates.includes(rawDate ?? '') ? (rawDate as string) : (feedDates[0] ?? new Date().toISOString().split('T')[0]!)
  const activeDateFeed = feed.find(g => g.date === activeDate)

  // 지역 탭
  const validRegionKeys = REGION_TABS.map(t => t.key)
  const activeRegion    = (typeof rawRegion === 'string' && validRegionKeys.includes(rawRegion as (typeof REGION_TABS)[number]['key']))
    ? rawRegion as (typeof REGION_TABS)[number]['key']
    : 'all'
  const activeTab = REGION_TABS.find(t => t.key === activeRegion) ?? REGION_TABS[0]!

  const [ranking, allTimeHighs] = await Promise.all([
    getRegionalPriceRanking(supabase, [...activeTab.sggCodes]).catch(() => []),
    getRegionalAllTimeHighs(supabase, [...activeTab.sggCodes]).catch(() => []),
  ])

  const pageUrl = `${SITE}/rankings`

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>

      {/* 헤더 */}
      <header style={{
        height: 56, background: '#fff', borderBottom: '1px solid var(--line-default)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 20,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <Link href="/" className="dj-logo" style={{ flexShrink: 0 }}>
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
        <nav style={{ display: 'flex', gap: 16, font: '600 13px/1 var(--font-sans)', overflow: 'hidden' }}>
          <Link href="/"         style={{ color: 'var(--fg-sec)',     textDecoration: 'none', whiteSpace: 'nowrap' }}>홈</Link>
          <Link href="/map"      style={{ color: 'var(--fg-sec)',     textDecoration: 'none', whiteSpace: 'nowrap' }}>지도</Link>
          <Link href="/presale"  style={{ color: 'var(--fg-sec)',     textDecoration: 'none', whiteSpace: 'nowrap' }}>분양</Link>
          <Link href="/rankings" style={{ color: 'var(--dj-orange)',  textDecoration: 'none', whiteSpace: 'nowrap' }}>랭킹</Link>
        </nav>
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <Suspense><UserMenu /></Suspense>
        </div>
      </header>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* ── 히어로 ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <h1 style={{ font: '800 22px/1.2 var(--font-sans)', letterSpacing: '-0.03em', margin: '0 0 6px' }}>
                실거래 랭킹
              </h1>
              {newRecordCount > 0 && (
                <span style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          5,
                  font:         '600 12px/1 var(--font-sans)',
                  padding:      '4px 10px',
                  borderRadius: 20,
                  background:   '#fff7ed',
                  color:        '#ea580c',
                  border:       '1px solid #fed7aa',
                }}>
                  <span style={{ font: '700 14px/1', color: '#ea580c' }}>{newRecordCount}</span>개 단지 신고가 경신 중
                </span>
              )}
            </div>
            <ShareButton url={pageUrl} title="창원·김해 실거래 랭킹 | 단지온도" text="창원·김해 아파트 실거래가 랭킹을 확인해보세요." />
          </div>
        </div>

        {/* ── 섹션 1: 구별 대장단지 ── */}
        <section aria-labelledby="champion-heading" style={{ marginBottom: 32 }}>
          <SectionHeader title="구별 대장단지" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {champions.map(({ sggCode, regionLabel, data }) => (
              <div key={sggCode} className="card" style={{ padding: '12px 14px' }}>
                <span style={{
                  display: 'inline-block', font: '700 10px/1 var(--font-sans)',
                  padding: '2px 8px', borderRadius: 10,
                  background: 'var(--dj-orange)', color: '#fff', marginBottom: 8,
                }}>
                  {regionLabel}
                </span>
                {data ? (
                  <>
                    <Link
                      href={complexHref(data.complexId, data.urlSlug)}
                      style={{ font: '600 13px/1.4 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none', display: 'block', marginBottom: 6 }}
                    >
                      {data.complexName}
                    </Link>
                    <p style={{ font: '800 17px/1 var(--font-sans)', color: 'var(--dj-orange)', margin: '0 0 4px' }}>
                      {data.avgPricePerPyeong.toLocaleString()}
                      <span style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-sec)', marginLeft: 2 }}>만/평</span>
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {data.priceChange30d != null && (
                        <span style={{ font: '600 11px/1 var(--font-sans)', color: data.priceChange30d >= 0 ? '#16a34a' : '#dc2626' }}>
                          {data.priceChange30d >= 0 ? '▲' : '▼'}{Math.abs(data.priceChange30d * 100).toFixed(1)}%
                        </span>
                      )}
                      {data.txCount90d > 0 && (
                        <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                          {data.txCount90d}건
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>데이터 없음</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── 섹션 2: 구별 거래 온도 ── */}
        {tradingHeat.length > 0 && (
          <section aria-labelledby="heat-heading" style={{ marginBottom: 32 }}>
            <SectionHeader title="구별 거래 온도" />
            <TradingHeatBar heat={tradingHeat} />
          </section>
        )}

        {/* ── 섹션 3: 일별 실거래 피드 ── */}
        <section aria-labelledby="feed-heading" style={{ marginBottom: 32 }}>
          <SectionHeader title="일별 실거래 피드">
            <ShareButton
              url={`${pageUrl}?date=${activeDate}`}
              title={`${activeDate} 창원·김해 실거래 | 단지온도`}
              text={activeDateFeed ? `${activeDate} 거래 ${activeDateFeed.transactions.length}건` : undefined}
            />
          </SectionHeader>

          {/* 날짜 탭 */}
          {feedDates.length > 0 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12, scrollbarWidth: 'none' }}>
              {feedDates.map(d => (
                <Link key={d} href={`/rankings?date=${d}&region=${activeRegion}`} scroll={false} style={chip(d === activeDate)}>
                  {d.slice(5).replace('-', '/')}
                </Link>
              ))}
            </div>
          )}

          <p style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 10px' }}>
            국토부 실거래 신고일 기준 · 신고 지연으로 최근 거래는 추후 반영될 수 있음
          </p>

          {!activeDateFeed || activeDateFeed.transactions.length === 0 ? (
            <div className="card" style={{ padding: 28, textAlign: 'center' }}>
              <p style={{ font: '500 13px/1.6 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                {activeDate} — 거래 데이터가 없습니다
              </p>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {activeDateFeed.transactions.map((tx, idx) => (
                <div
                  key={tx.id}
                  style={{
                    display:       'flex',
                    alignItems:    'center',
                    gap:           10,
                    padding:       '11px 14px',
                    borderBottom:  idx < activeDateFeed.transactions.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                  }}
                >
                  <span className="tnum" style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', minWidth: 18, textAlign: 'right', flexShrink: 0 }}>
                    {idx + 1}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
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
                    <p style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                      {formatPyeong(tx.area_m2)}{tx.floor != null ? ` · ${tx.floor}층` : ''}{tx.dong ? ` · ${tx.dong}` : ''}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className="tnum" style={{ font: '700 14px/1 var(--font-sans)', color: 'var(--fg-pri)', display: 'block' }}>
                      {formatPrice(tx.price)}
                    </span>
                    {tx.priceDelta != null && Math.abs(tx.priceDelta) >= 100 && (
                      <span className="tnum" style={{ font: '600 10px/1 var(--font-sans)', color: tx.priceDelta > 0 ? '#16a34a' : '#dc2626', display: 'block', marginTop: 2 }}>
                        {tx.priceDelta > 0 ? '▲' : '▼'}{formatPrice(Math.abs(tx.priceDelta))}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeDateFeed?.hasMore && (
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <Link href={`/rankings/${activeDate}`} style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--dj-orange)', textDecoration: 'none' }}>
                이 날 전체 거래 보기 →
              </Link>
            </div>
          )}
        </section>

        {/* ── 섹션 4: 지역 평당가 랭킹 ── */}
        <section aria-labelledby="ranking-heading" style={{ marginBottom: 32 }}>
          <SectionHeader title="지역 평당가 랭킹">
            <ShareButton url={`${pageUrl}?region=${activeRegion}`} title={`${activeTab.label} 평당가 랭킹 | 단지온도`} />
          </SectionHeader>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12, scrollbarWidth: 'none' }}>
            {REGION_TABS.map(tab => (
              <Link key={tab.key} href={`/rankings?date=${activeDate}&region=${tab.key}`} scroll={false} style={chip(tab.key === activeRegion)}>
                {tab.label}
              </Link>
            ))}
          </div>

          {ranking.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <p style={{ font: '500 13px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>해당 지역 데이터가 없습니다</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {ranking.map((row, idx) => (
                <div key={row.complexId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: idx < ranking.length - 1 ? '1px solid var(--line-subtle)' : 'none' }}>
                  <span className="tnum" style={{
                    font: row.rank <= 3 ? '800 13px/1 var(--font-sans)' : '500 12px/1 var(--font-sans)',
                    color: row.rank === 1 ? 'var(--dj-orange)' : row.rank <= 3 ? 'var(--fg-sec)' : 'var(--fg-tertiary)',
                    minWidth: 20, textAlign: 'right', flexShrink: 0,
                  }}>
                    {row.rank}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={complexHref(row.complexId, row.urlSlug)} style={{ font: '600 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none', display: 'block' }}>
                      {row.complexName}
                    </Link>
                    {(row.si ?? row.gu) && (
                      <p style={{ font: '400 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '3px 0 0' }}>
                        {[row.si, row.gu].filter(Boolean).join(' ')}
                        {row.recentTradePrice != null && <span style={{ marginLeft: 6 }}>최근 {formatPrice(row.recentTradePrice)}</span>}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className="tnum" style={{ font: '700 15px/1 var(--font-sans)', color: 'var(--dj-orange)', display: 'block' }}>
                      {row.avgPricePerPyeong.toLocaleString()}
                    </span>
                    <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>만/평</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 섹션 5: 지역 역대 최고가 ── */}
        <section aria-labelledby="alltime-heading" style={{ marginBottom: 32 }}>
          <SectionHeader title="지역 역대 최고가">
            <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
              {activeTab.label} · 단지별 1건
            </span>
          </SectionHeader>

          {allTimeHighs.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <p style={{ font: '500 13px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>데이터 없음</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {allTimeHighs.map((row, idx) => (
                <div key={row.complexId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: idx < allTimeHighs.length - 1 ? '1px solid var(--line-subtle)' : 'none' }}>
                  <span className="tnum" style={{
                    font:      '700 12px/1 var(--font-sans)',
                    color:     idx === 0 ? 'var(--dj-orange)' : 'var(--fg-tertiary)',
                    minWidth:  20, textAlign: 'right', flexShrink: 0,
                  }}>
                    {idx + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={complexHref(row.complexId, row.urlSlug)} style={{ font: '600 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none', display: 'block' }}>
                      {row.complexName}
                    </Link>
                    <p style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '3px 0 0' }}>
                      {formatPyeong(row.area_m2)} ({row.area_m2.toFixed(0)}㎡){row.floor != null ? ` · ${row.floor}층` : ''} · {row.deal_date.slice(0, 7)}
                    </p>
                  </div>
                  <span className="tnum" style={{ font: '700 15px/1 var(--font-sans)', color: 'var(--fg-pri)', flexShrink: 0 }}>
                    {formatPrice(row.price)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 섹션 6: 흥미 지표 ── */}
        <section aria-labelledby="highlights-heading" style={{ marginBottom: 32 }}>
          <SectionHeader title="흥미 지표" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* 최근 최고가 거래 */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ marginBottom: 14 }}>
                <span style={{ font: '700 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>최근 최고가 거래</span>
                <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginLeft: 8 }}>30일 이내 TOP 5</span>
              </div>
              {highlights.topPriceRecent.length === 0 ? (
                <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>데이터 없음</p>
              ) : highlights.topPriceRecent.map((item, idx) => (
                <div key={item.complexId} style={{ display: 'flex', gap: 10, paddingBottom: idx < highlights.topPriceRecent.length - 1 ? 12 : 0, marginBottom: idx < highlights.topPriceRecent.length - 1 ? 12 : 0, borderBottom: idx < highlights.topPriceRecent.length - 1 ? '1px solid var(--line-subtle)' : 'none' }}>
                  <RankCircle rank={idx + 1} />
                  <div style={{ minWidth: 0 }}>
                    <Link href={complexHref(item.complexId, item.urlSlug)} style={{ font: '600 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none', display: 'block' }}>
                      {item.complexName}
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span className="tnum" style={{ font: '700 17px/1 var(--font-sans)', color: 'var(--dj-orange)' }}>
                        {formatPrice(item.price)}
                      </span>
                      <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                        {formatPyeong(item.area_m2)} · {item.deal_date.slice(5).replace('-', '/')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 거래 활발 단지 */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ marginBottom: 14 }}>
                <span style={{ font: '700 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>거래 활발 단지</span>
                <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginLeft: 8 }}>90일 거래량 TOP 5</span>
              </div>
              {highlights.topVolumeRecent.length === 0 ? (
                <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>데이터 없음</p>
              ) : highlights.topVolumeRecent.map((item, idx) => (
                <div key={item.complexId} style={{ display: 'flex', gap: 10, paddingBottom: idx < highlights.topVolumeRecent.length - 1 ? 12 : 0, marginBottom: idx < highlights.topVolumeRecent.length - 1 ? 12 : 0, borderBottom: idx < highlights.topVolumeRecent.length - 1 ? '1px solid var(--line-subtle)' : 'none' }}>
                  <RankCircle rank={idx + 1} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={complexHref(item.complexId, item.urlSlug)} style={{ font: '600 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none', display: 'block' }}>
                      {item.complexName}
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                      <span className="tnum" style={{ font: '700 17px/1 var(--font-sans)', color: 'var(--dj-orange)' }}>
                        {item.txCount90d}건
                      </span>
                      <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                        90일 거래
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 가격 상승 단지 */}
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ marginBottom: 14 }}>
                <span style={{ font: '700 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>가격 상승 단지</span>
                <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginLeft: 8 }}>전월 대비 3% 이상</span>
              </div>
              {highlights.priceSurgeRecent.length === 0 ? (
                <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>해당 단지 없음</p>
              ) : highlights.priceSurgeRecent.map((item, idx) => (
                <div key={item.complexId} style={{ display: 'flex', gap: 10, paddingBottom: idx < highlights.priceSurgeRecent.length - 1 ? 12 : 0, marginBottom: idx < highlights.priceSurgeRecent.length - 1 ? 12 : 0, borderBottom: idx < highlights.priceSurgeRecent.length - 1 ? '1px solid var(--line-subtle)' : 'none' }}>
                  <RankCircle rank={idx + 1} />
                  <div style={{ minWidth: 0 }}>
                    <Link href={complexHref(item.complexId, item.urlSlug)} style={{ font: '600 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none', display: 'block' }}>
                      {item.complexName}
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                      <span className="tnum" style={{ font: '700 17px/1 var(--font-sans)', color: '#16a34a' }}>
                        +{(item.changeRatio * 100).toFixed(1)}%
                      </span>
                      <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                        전월 대비
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* 데이터 출처 */}
        <p style={{ font: '400 11px/1.6 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
          국토교통부 실거래가 공개시스템 기준 · 매도(sale) 거래만 표시 · 취소·정정 제외 · 매일 새벽 갱신
        </p>

      </main>

      {/* 카페 CTA 푸터 */}
      <footer style={{ borderTop: '1px solid var(--line-default)', background: '#fff', padding: '20px 16px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ font: '700 14px/1.3 var(--font-sans)', margin: '0 0 3px' }}>창원부동산이야기</p>
            <p style={{ font: '400 12px/1 var(--font-sans)', color: 'var(--fg-sec)', margin: 0 }}>더 많은 정보와 의견을 카페에서 나눠보세요</p>
          </div>
          <a
            href={CAFE_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: 8,
              font: '700 13px/1 var(--font-sans)', color: '#fff', background: '#03c75a',
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            카페 바로가기
          </a>
        </div>
      </footer>

    </div>
  )
}
