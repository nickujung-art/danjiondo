import type { Metadata } from 'next'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import { getRecentHighRecords } from '@/lib/data/homepage'
import { getRankingsByType } from '@/lib/data/rankings'
import {
  getActiveListingCount,
  getActiveListings,
  getRecentlyExpiredListings,
  getRedevelopmentComplexes,
  getEnrichedPresaleItems,
} from '@/lib/data/presale'
import { PresaleCard } from '@/components/presale/PresaleCard'
import { RedevelopmentCard } from '@/components/presale/RedevelopmentCard'
import { EnrichedPresaleCard } from '@/components/presale/EnrichedPresaleCard'
import { HighRecordCard } from '@/components/home/HighRecordCard'
import { RankingTabs } from '@/components/home/RankingTabs'
import { UserMenu } from '@/components/auth/UserMenu'
import { AdBannerCarousel } from '@/components/ads/AdBannerCarousel'
import { getActiveAds } from '@/lib/data/ads'
import Link from 'next/link'
import { Suspense } from 'react'

export const revalidate = 60  // ISR 60s — createReadonlyClient()가 cookies() 미호출로 ISR 안전

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'

export const metadata: Metadata = {
  title: '단지온도 — 창원·김해 아파트 실거래가',
  description: '창원·김해 아파트 실거래가와 동네 의견을 한 화면에서. 매매·전세·월세 시세를 빠르게 확인하세요.',
  openGraph: {
    title:       '단지온도 — 창원·김해 아파트 실거래가',
    description: '창원·김해 아파트 실거래가와 동네 의견을 한 화면에서.',
    url:         `${SITE}/`,
    siteName:    '단지온도',
    locale:      'ko_KR',
    type:        'website',
  },
  alternates: {
    canonical: `${SITE}/`,
  },
}

function SearchIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}

export default async function HomePage() {
  const supabase = createReadonlyClient()

  const [highRecords, rankHighPrice, rankVolume, rankPricePerPyeong, rankInterest, activeListingCount, activeListings, recentlyExpired, redevelopments, bannerAds, enrichedPresale] =
    await Promise.all([
      getRecentHighRecords(supabase, 4).catch(() => []),
      getRankingsByType(supabase, 'high_price', 10).catch(() => []),
      getRankingsByType(supabase, 'volume', 10).catch(() => []),
      getRankingsByType(supabase, 'price_per_pyeong', 10).catch(() => []),
      getRankingsByType(supabase, 'interest', 10).catch(() => []),
      getActiveListingCount(supabase).catch(() => 0),
      getActiveListings(supabase, 4).catch(() => []),
      getRecentlyExpiredListings(supabase, 4).catch(() => []),
      getRedevelopmentComplexes(supabase, 3).catch(() => []),
      getActiveAds('banner_top', supabase).catch(() => []),
      getEnrichedPresaleItems(supabase, 4).catch(() => []),
    ])

  const rankingData = {
    high_price: rankHighPrice,
    volume: rankVolume,
    price_per_pyeong: rankPricePerPyeong,
    interest: rankInterest,
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Nav */}
      <header
        style={{
          height: 60,
          borderBottom: '1px solid var(--line-default)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          gap: 32,
          flexShrink: 0,
          background: '#fff',
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
          <Link href="/" style={{ color: 'var(--dj-orange)', textDecoration: 'none' }}>
            홈
          </Link>
          <Link href="/map" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>
            지도
          </Link>
          <Link href="/presale" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>
            분양
          </Link>
          <Link href="/favorites" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>
            관심단지
          </Link>
          <Link href="/rankings" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>
            랭킹
          </Link>
        </nav>

        {/* Centered search → navigates to /map?q=... */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <form action="/map" method="get" style={{ position: 'relative', width: 480 }}>
            <span
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--fg-tertiary)',
                pointerEvents: 'none',
              }}
            >
              <SearchIcon />
            </span>
            <input
              name="q"
              className="input"
              style={{ paddingLeft: 44 }}
              placeholder="단지명, 지역으로 검색"
              autoComplete="off"
            />
          </form>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-md btn-ghost btn-icon"
            style={{ color: 'var(--fg-sec)' }}
            aria-label="알림"
          >
            <BellIcon />
          </button>
          <Suspense
            fallback={
              <Link
                href="/login"
                className="btn btn-md btn-secondary"
                style={{ textDecoration: 'none' }}
              >
                로그인
              </Link>
            }
          >
            <UserMenu />
          </Suspense>
        </div>
      </header>

      {/* Body */}
      <main style={{ flex: 1, padding: '32px 48px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        {bannerAds.length > 0 && <AdBannerCarousel ads={bannerAds} />}
        {/* Section title */}
        <h1
          style={{
            font: '700 36px/1.2 var(--font-sans)',
            letterSpacing: '-0.025em',
            margin: '0 0 4px',
          }}
        >
          오늘 신고가
        </h1>
        <p
          style={{
            font: '500 14px/1.4 var(--font-sans)',
            color: 'var(--fg-sec)',
            margin: '0 0 24px',
          }}
        >
          창원·김해 최근 30일 최고 실거래가
        </p>

        {/* 신고가 cards */}
        {highRecords.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
              marginBottom: 40,
            }}
          >
            {highRecords.map((rec) => (
              <HighRecordCard key={rec.complex.id + rec.deal_date} record={rec} />
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: '48px 0',
              textAlign: 'center',
              color: 'var(--fg-tertiary)',
              font: '500 14px/1.6 var(--font-sans)',
              marginBottom: 40,
            }}
          >
            최근 30일 실거래 데이터가 없습니다.
            <br />
            <Link href="/map" style={{ color: 'var(--dj-orange)' }}>
              지도에서 단지 탐색하기 →
            </Link>
          </div>
        )}

        {/* Rankings */}
        <RankingTabs initialData={rankingData} />

        {/* 분양 섹션 — 3줄 레이아웃 */}
        <section style={{ marginTop: 48 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
            <h2 style={{ font: '700 20px/1.3 var(--font-sans)', letterSpacing: '-0.02em', color: 'var(--fg-pri)', margin: 0 }}>
              분양
              {activeListingCount > 0 && (
                <span className="badge pos" style={{ marginLeft: 10, font: '500 11px/1 var(--font-sans)' }}>
                  {activeListingCount}건 진행 중
                </span>
              )}
            </h2>
            <Link href="/presale" style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--dj-orange)', textDecoration: 'none' }}>
              전체 보기 →
            </Link>
          </div>

          {/* 행 1: 분양 예정 (청약홈 미등록) */}
          {enrichedPresale.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>분양 예정</span>
                <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>청약홈 미등록 단지</span>
              </div>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                {enrichedPresale.map(item => (
                  <div key={item.id} style={{ minWidth: 280, maxWidth: 300, flexShrink: 0 }}>
                    <EnrichedPresaleCard item={item} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 행 2: 분양 공고 */}
          {activeListings.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>분양 공고</span>
                <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>청약홈 기준</span>
              </div>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                {activeListings.map(l => (
                  <div key={l.id} style={{ minWidth: 260, maxWidth: 280, flexShrink: 0 }}>
                    <PresaleCard listing={l} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 행 3: 최근 마감 */}
          {recentlyExpired.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>최근 마감</span>
                <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>30일 이내</span>
              </div>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                {recentlyExpired.map(l => (
                  <div key={l.id} style={{ minWidth: 260, maxWidth: 280, flexShrink: 0 }}>
                    <PresaleCard listing={l} expired />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 데이터 없을 때 재건축 fallback */}
          {enrichedPresale.length === 0 && activeListings.length === 0 && recentlyExpired.length === 0 && redevelopments.length > 0 && (
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
              {redevelopments.map(c => (
                <div key={c.id} style={{ minWidth: 260, maxWidth: 280, flexShrink: 0 }}>
                  <RedevelopmentCard complex={c} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
