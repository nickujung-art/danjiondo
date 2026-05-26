import type { Metadata } from 'next'
import Link from 'next/link'
import { AdInquiryForm } from '@/components/ads/AdInquiryForm'

export const metadata: Metadata = {
  title: '광고 문의 — 단지온도',
  description:
    '창원·김해 아파트 실거래가 플랫폼 단지온도에 광고하세요. 중개사무소, 건설사, 인테리어·이사 업체 광고 문의를 받습니다.',
}

const PRICING_PACKAGES = [
  { period: '1주 (7일)', badge: '단기', desc: '이벤트·프로모션에 적합' },
  { period: '1달 (30일)', badge: '인기', desc: '브랜드 인지도 구축에 최적' },
  { period: '3달 (90일)', badge: '할인', desc: '장기 노출로 최대 효과' },
] as const

const TARGET_TYPES = [
  '부동산 중개사무소',
  '건설사·시행사',
  '부동산 금융·대출',
  '인테리어·이사 업체',
] as const

export default function AdsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: 'var(--font-sans)' }}>
      <header
        style={{
          height: 60,
          borderBottom: '1px solid var(--line-default)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          gap: 32,
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: '#fff',
        }}
      >
        <Link href="/" className="dj-logo">
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
        <span style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
          광고 문의
        </span>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '48px 32px' }}>
        {/* 히어로 */}
        <section style={{ marginBottom: 48, textAlign: 'center' }}>
          <h1
            style={{
              font: '700 32px/1.2 var(--font-sans)',
              letterSpacing: '-0.025em',
              margin: '0 0 12px',
            }}
          >
            창원·김해 실수요자에게
            <br />
            직접 닿으세요
          </h1>
          <p
            style={{
              font: '500 15px/1.6 var(--font-sans)',
              color: 'var(--fg-sec)',
              margin: '0 auto',
              maxWidth: 560,
            }}
          >
            단지온도는 창원·김해 아파트 실거래가를 찾는 실수요자가 매일 방문하는 플랫폼입니다.
            광고를 통해 관심 고객에게 직접 도달하세요.
          </p>
        </section>

        {/* 대상 업체 */}
        <section style={{ marginBottom: 40 }}>
          <h2
            style={{
              font: '700 16px/1.3 var(--font-sans)',
              letterSpacing: '-0.02em',
              margin: '0 0 16px',
            }}
          >
            이런 업체에 적합합니다
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TARGET_TYPES.map(type => (
              <span key={type} className="chip sm" style={{ fontSize: 13 }}>
                {type}
              </span>
            ))}
          </div>
        </section>

        {/* 가격 패키지 */}
        <section style={{ marginBottom: 48 }}>
          <h2
            style={{
              font: '700 16px/1.3 var(--font-sans)',
              letterSpacing: '-0.02em',
              margin: '0 0 16px',
            }}
          >
            광고 상품
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
            }}
          >
            {PRICING_PACKAGES.map(pkg => (
              <div
                key={pkg.period}
                className="card"
                style={{ padding: '20px 16px', textAlign: 'center' }}
              >
                <span
                  className="badge pos"
                  style={{ marginBottom: 8, display: 'inline-block', fontSize: 11 }}
                >
                  {pkg.badge}
                </span>
                <div
                  style={{
                    font: '700 18px/1.2 var(--font-sans)',
                    letterSpacing: '-0.02em',
                    margin: '0 0 6px',
                  }}
                >
                  {pkg.period}
                </div>
                <div
                  style={{
                    font: '500 12px/1.4 var(--font-sans)',
                    color: 'var(--fg-tertiary)',
                  }}
                >
                  {pkg.desc}
                </div>
              </div>
            ))}
          </div>
          <p
            style={{
              font: '500 12px/1.4 var(--font-sans)',
              color: 'var(--fg-tertiary)',
              margin: '12px 0 0',
            }}
          >
            * 단가는 문의 후 개별 안내드립니다. 홈페이지 상단 배너(banner_top) 지면 기준.
          </p>
        </section>

        {/* 문의 폼 */}
        <section>
          <h2
            style={{
              font: '700 16px/1.3 var(--font-sans)',
              letterSpacing: '-0.02em',
              margin: '0 0 16px',
            }}
          >
            광고 문의
          </h2>
          <AdInquiryForm />
        </section>
      </main>
    </div>
  )
}
