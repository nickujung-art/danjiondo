import Link from 'next/link'
import type { Metadata } from 'next'
import { Footer } from '@/components/layout/Footer'

export const metadata: Metadata = { title: '이용약관' }

export default function TermsPage() {
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
            이용약관
          </h1>
          <p
            style={{
              font:   '500 13px/1.5 var(--font-sans)',
              color:  'var(--fg-tertiary)',
              margin: '0 0 32px',
            }}
          >
            초안 — 법무 검토 전 / 시행일: 2026년 5월 6일
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            제1조 (목적)
          </h2>
          <p>
            본 약관은 단지온도(이하 &quot;서비스&quot;)가 제공하는 부동산 정보 및 커뮤니티 서비스의
            이용 조건과 절차, 회사와 회원 간의 권리·의무·책임사항을 규정함을 목적으로 합니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            제2조 (서비스 이용 신청 및 승낙)
          </h2>
          <p>
            회원은 본 약관 및 개인정보처리방침에 동의함으로써 회원가입을 완료하며,
            서비스는 가입 신청을 승낙합니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            제3조 (서비스 이용 제한)
          </h2>
          <p>
            회원은 다음 행위를 해서는 안 됩니다: 타인의 개인정보 도용, 허위 게시물 작성,
            광고·스팸 게시, 운영자 사칭 등. 위반 시 게시물 삭제 및 계정 정지 조치가 가능합니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            제4조 (게시물의 권리 및 책임)
          </h2>
          <p>
            회원이 작성한 후기·댓글의 저작권은 회원에게 귀속되며, 서비스는 이를 서비스 운영
            목적으로 사용할 수 있습니다. 회원은 자신의 게시물에 대한 법적 책임을 집니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            제5조 (면책 조항)
          </h2>
          <p>
            본 서비스가 제공하는 부동산 거래가·시세·랭킹·후기 등의 정보는 참고용이며,
            실제 투자·거래 판단의 책임은 사용자에게 있습니다. 정보의 정확성·최신성을 보장하지
            않으며 정보 활용으로 인한 손실에 대해 책임지지 않습니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            제6조 (분쟁 해결 및 관할)
          </h2>
          <p>
            서비스 이용과 관련하여 분쟁이 발생할 경우 회사와 회원이 상호 협의하여 해결하며,
            협의가 이루어지지 않을 경우 서울중앙지방법원을 관할 법원으로 합니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            제7조 (문의)
          </h2>
          <p>
            이용약관에 관한 문의는{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--dj-orange)' }}>
              {SUPPORT_EMAIL}
            </a>
            로 보내주십시오.
          </p>
        </article>
      </main>
      <Footer />
    </div>
  )
}
