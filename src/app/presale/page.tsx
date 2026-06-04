import type { Metadata } from 'next'
import Link from 'next/link'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import {
  getActiveListings,
  getRecentlyExpiredListings,
  getRedevelopmentComplexes,
  getNewBuiltComplexes,
  getEnrichedPresaleItems,
} from '@/lib/data/presale'
import { PresaleCard } from '@/components/presale/PresaleCard'
import { RedevelopmentCard } from '@/components/presale/RedevelopmentCard'
import { NewBuildCard } from '@/components/presale/NewBuildCard'
import { EnrichedPresaleCard } from '@/components/presale/EnrichedPresaleCard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '신축·분양·재건축 | 단지온도',
  description: '창원·김해 활성 분양 공고, 재건축 예정 단지, 신축 단지 정보를 한 화면에서 확인하세요.',
}

export default async function PresalePage() {
  const supabase = createReadonlyClient()
  const [listings, recentlyExpired, redevelopments, newBuilds, enrichedItems] = await Promise.all([
    getActiveListings(supabase, 20),
    getRecentlyExpiredListings(supabase, 20),
    getRedevelopmentComplexes(supabase, 20),
    getNewBuiltComplexes(supabase, 30),
    getEnrichedPresaleItems(supabase, 10),
  ])

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-canvas)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '16px 24px',
          borderBottom: '1px solid var(--line-default)',
        }}
      >
        <nav style={{ display: 'flex', gap: 24, font: '600 14px/1 var(--font-sans)' }}>
          <Link href="/" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>홈</Link>
          <Link href="/map" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>지도</Link>
          <Link href="/presale" style={{ color: 'var(--dj-orange)', textDecoration: 'none' }}>분양</Link>
          <Link href="/favorites" style={{ color: 'var(--fg-sec)', textDecoration: 'none' }}>관심단지</Link>
        </nav>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              font: '700 22px/1.3 var(--font-sans)',
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
              color: 'var(--fg-pri)',
            }}
          >
            창원·김해 신축·분양·재건축
          </h1>
          <p
            style={{
              font: '500 13px/1.4 var(--font-sans)',
              color: 'var(--fg-sec)',
              margin: 0,
            }}
          >
            청약홈 분양 공고 · admin 지정 재건축 단지 · 2021년 이후 신축 단지
          </p>
        </div>

        {/* Tier 0: 분양 예정 — 청약홈 미등록, 공식 사이트 크롤링 데이터 */}
        {enrichedItems.length > 0 && (
          <section style={{ marginBottom: 40 }} aria-labelledby="section-enriched">
            <h2
              id="section-enriched"
              style={{
                font: '700 18px/1.3 var(--font-sans)',
                letterSpacing: '-0.02em',
                margin: '0 0 4px',
                color: 'var(--fg-pri)',
              }}
            >
              분양 예정
            </h2>
            <p style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 16px' }}>
              청약홈에 미등록된 분양 예정 단지 · 공식 사이트 기준
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {enrichedItems.map(item => (
                <EnrichedPresaleCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* Tier 1: 분양 공고 (데이터 없으면 헤더도 숨김) */}
        {listings.length > 0 && (
          <section style={{ marginBottom: 40 }} aria-labelledby="section-presale">
            <h2
              id="section-presale"
              style={{
                font: '700 18px/1.3 var(--font-sans)',
                letterSpacing: '-0.02em',
                margin: '0 0 16px',
                color: 'var(--fg-pri)',
              }}
            >
              분양 공고
              <span
                className="badge pos"
                style={{ marginLeft: 12, font: '500 11px/1 var(--font-sans)' }}
              >
                {listings.length}건 진행 중
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {listings.map(l => (
                <PresaleCard key={l.id} listing={l} />
              ))}
            </div>
          </section>
        )}

        {/* Tier 1-B: 최근 30일 마감 공고 (활성 공고 없을 때 또는 항상 하단 표시) */}
        {recentlyExpired.length > 0 && (
          <section style={{ marginBottom: 40 }} aria-labelledby="section-expired">
            <h2
              id="section-expired"
              style={{
                font: '700 18px/1.3 var(--font-sans)',
                letterSpacing: '-0.02em',
                margin: '0 0 4px',
                color: 'var(--fg-pri)',
              }}
            >
              최근 마감
            </h2>
            <p style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 16px' }}>
              30일 이내 청약 마감된 공고입니다.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {recentlyExpired.map(l => (
                <PresaleCard key={l.id} listing={l} expired />
              ))}
            </div>
          </section>
        )}

        {/* Tier 2: 재건축 예정 (데이터 없으면 헤더도 숨김) */}
        {redevelopments.length > 0 && (
          <section style={{ marginBottom: 40 }} aria-labelledby="section-redev">
            <h2
              id="section-redev"
              style={{
                font: '700 18px/1.3 var(--font-sans)',
                letterSpacing: '-0.02em',
                margin: '0 0 16px',
                color: 'var(--fg-pri)',
              }}
            >
              재건축 예정
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {redevelopments.map(c => (
                <RedevelopmentCard key={c.id} complex={c} />
              ))}
            </div>
          </section>
        )}

        {/* Tier 3: 신축 단지 — 항상 헤더 표시 */}
        <section aria-labelledby="section-newbuild">
          <h2
            id="section-newbuild"
            style={{
              font: '700 18px/1.3 var(--font-sans)',
              letterSpacing: '-0.02em',
              margin: '0 0 16px',
              color: 'var(--fg-pri)',
            }}
          >
            신축 단지
            <span
              style={{
                marginLeft: 8,
                font: '500 12px/1 var(--font-sans)',
                color: 'var(--fg-sec)',
              }}
            >
              2021년 이후 준공, 최신순
            </span>
          </h2>
          {newBuilds.length === 0 ? (
            <div
              style={{
                padding: '40px 0',
                textAlign: 'center',
                font: '500 13px/1.6 var(--font-sans)',
                color: 'var(--fg-tertiary)',
              }}
            >
              2021년 이후 준공된 단지가 등록되지 않았습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {newBuilds.map(c => (
                <NewBuildCard key={c.id} complex={c} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
