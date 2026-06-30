import Link from 'next/link'
import type { Metadata } from 'next'
import { Footer } from '@/components/layout/Footer'

export const metadata: Metadata = { title: '광고 정책' }

export default function AdPolicyPage() {
  const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? 'support@danjiondo.com'

  return (
    <div
      style={{
        minHeight:  '100vh',
        background: 'var(--bg-canvas)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
        <article>
          <h1
            style={{
              font:          '700 28px/1.3 var(--font-sans)',
              letterSpacing: '-0.02em',
              margin:        '0 0 8px',
            }}
          >
            광고 정책
          </h1>
          <p
            style={{
              font:   '500 13px/1.5 var(--font-sans)',
              color:  'var(--fg-tertiary)',
              margin: '0 0 32px',
            }}
          >
            초안 — 법무 검토 전 / 시행일: 2026년 5월 6일 / 표시광고법 준수
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            1. 광고 표시 방법
          </h2>
          <p>
            광고는 일반 콘텐츠와 명확히 구분되도록 &quot;광고&quot; 라벨을 부착하여 노출합니다.
            지면 위치는 banner_top, sidebar, in_feed 3종으로 한정됩니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            2. 광고주 신원 정보
          </h2>
          <p>
            모든 광고에는 광고주 명칭이 표시됩니다.
            광고주는 사업자등록 정보를 제출해야 광고가 게재될 수 있습니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            3. 허위·과장 광고 금지
          </h2>
          <p>
            표시광고법에 따라 거짓·과장·기만적 표시 또는 광고는 금지됩니다.
            부동산 시세·수익률·확정 분양가 등 검증되지 않은 수치 광고는 거부됩니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            4. 광고 심사 절차
          </h2>
          <p>
            광고주가 등록한 광고(<code>draft</code>)는 심사 신청(<code>pending</code>) 후
            운영자 검수를 거쳐 승인(<code>approved</code>)되어 게재됩니다.
            위반 광고는 거절(<code>rejected</code>) 또는 일시중지(<code>paused</code>) 처리됩니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            5. 광고 중단 및 거절 기준
          </h2>
          <p>
            본 정책 또는 관련 법령 위반, 사용자 신고 다수 접수, 운영상 부적절 판단 시
            광고 중단·거절이 가능하며 사전 통지를 원칙으로 합니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            문의
          </h2>
          <p>
            광고 정책 관련 문의:{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--dj-orange)' }}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </article>
      </main>
      <Footer />
    </div>
  )
}
