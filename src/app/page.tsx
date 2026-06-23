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
import { AdBannerCarousel } from '@/components/ads/AdBannerCarousel'
import { getActiveAds } from '@/lib/data/ads'
import Link from 'next/link'

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
    <main className="px-4 py-6 sm:px-8 sm:py-10 max-w-screen-xl mx-auto w-full">
      {bannerAds.length > 0 && <AdBannerCarousel ads={bannerAds} />}

      {/* Section title */}
      <h1
        className="mt-0 mb-1"
        style={{ font: '700 36px/1.2 var(--font-sans)', letterSpacing: '-0.025em' }}
      >
        오늘 신고가
      </h1>
      <p
        className="mt-0 mb-6"
        style={{ font: '500 14px/1.4 var(--font-sans)', color: 'var(--fg-sec)' }}
      >
        창원·김해 최근 30일 최고 실거래가
      </p>

      {/* 신고가 cards */}
      {highRecords.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {highRecords.map((rec) => (
            <HighRecordCard key={rec.complex.id + rec.deal_date} record={rec} />
          ))}
        </div>
      ) : (
        <div
          className="py-12 text-center mb-10"
          style={{ color: 'var(--fg-tertiary)', font: '500 14px/1.6 var(--font-sans)' }}
        >
          최근 30일 실거래 데이터가 없습니다.
          <br />
          <Link
            href="/map"
            className="min-h-[44px] inline-flex items-center"
            style={{ color: 'var(--dj-orange)' }}
          >
            지도에서 단지 탐색하기 →
          </Link>
        </div>
      )}

      {/* Rankings */}
      <RankingTabs initialData={rankingData} />

      {/* 분양 섹션 — 3줄 레이아웃 */}
      <section className="mt-12">
        <div className="flex justify-between items-baseline mb-5">
          <h2
            className="m-0"
            style={{ font: '700 20px/1.3 var(--font-sans)', letterSpacing: '-0.02em', color: 'var(--fg-pri)' }}
          >
            분양
            {activeListingCount > 0 && (
              <span className="badge pos ml-2.5" style={{ font: '500 11px/1 var(--font-sans)' }}>
                {activeListingCount}건 진행 중
              </span>
            )}
          </h2>
          <Link
            href="/presale"
            className="min-h-[44px] inline-flex items-center"
            style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--dj-orange)', textDecoration: 'none' }}
          >
            전체 보기 →
          </Link>
        </div>

        {/* 행 1: 분양 예정 (청약홈 미등록) */}
        {enrichedPresale.length > 0 && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2.5">
              <span style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>분양 예정</span>
              <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>청약홈 미등록 단지</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
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
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2.5">
              <span style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>분양 공고</span>
              <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>청약홈 기준</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
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
          <div className="mb-2">
            <div className="flex justify-between items-center mb-2.5">
              <span style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>최근 마감</span>
              <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>30일 이내</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
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
          <div className="flex gap-3 overflow-x-auto pb-1">
            {redevelopments.map(c => (
              <div key={c.id} style={{ minWidth: 260, maxWidth: 280, flexShrink: 0 }}>
                <RedevelopmentCard complex={c} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
