import Link from 'next/link'
import type { Metadata } from 'next'
import { Footer } from '@/components/layout/Footer'

export const metadata: Metadata = { title: '개인정보처리방침' }

export default function PrivacyPage() {
  const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL       ?? 'support@danjiondo.com'
  const CPO_NAME      = process.env.NEXT_PUBLIC_PRIVACY_CPO_NAME  ?? '단지온도 개인정보 보호책임자'
  const CPO_EMAIL     = process.env.NEXT_PUBLIC_PRIVACY_CPO_EMAIL ?? SUPPORT_EMAIL

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
            개인정보처리방침
          </h1>
          <p
            style={{
              font:   '500 13px/1.5 var(--font-sans)',
              color:  'var(--fg-tertiary)',
              margin: '0 0 32px',
            }}
          >
            초안 — 법무 검토 전 / 시행일: 2026년 5월 6일 / 개인정보보호법 §30 준수
          </p>

          {/* 개인정보보호법 §30 8개 의무 항목 */}

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            1. 개인정보의 처리 목적
          </h2>
          <p>
            회원 식별, 서비스 제공(후기·관심단지·알림), 부정 이용 방지, 법령상 의무 이행.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            2. 처리하는 개인정보 항목
          </h2>
          <p>
            필수: 이메일, 닉네임, 가입 OAuth 식별자(Naver), IP 해시.
            선택: 카페 닉네임, 푸시 구독 정보.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            3. 개인정보의 처리 및 보유 기간
          </h2>
          <p>
            회원 탈퇴 시 30일 grace 기간 후 영구 삭제.
            법령상 보유 의무가 있는 경우 해당 기간 동안 분리 보관 후 파기.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            4. 개인정보의 제3자 제공
          </h2>
          <p>
            제공하지 않습니다. 단, 법령에 따라 적법한 절차로 요구받은 경우 제공할 수 있습니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            5. 개인정보 처리의 위탁
          </h2>
          <ul style={{ paddingLeft: 20 }}>
            <li>Supabase Inc. — 인증 및 데이터베이스</li>
            <li>Vercel Inc. — 호스팅 및 배포</li>
            <li>Resend Inc. — 알림 이메일 발송</li>
            <li>Kakao Corp. — 지도 및 주소 검색</li>
          </ul>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            6. 정보주체의 권리·의무 및 행사 방법
          </h2>
          <p>
            회원은 언제든지 개인정보 열람·정정·삭제·처리정지 요구를 할 수 있습니다.
            /profile 페이지에서 직접 또는 아래 보호책임자에게 이메일로 요청하시기 바랍니다.
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            7. 개인정보 보호책임자
          </h2>
          <p>
            {CPO_NAME} (
            <a href={`mailto:${CPO_EMAIL}`} style={{ color: 'var(--dj-orange)' }}>
              {CPO_EMAIL}
            </a>
            )
          </p>

          <h2 style={{ font: '700 18px/1.4 var(--font-sans)', margin: '24px 0 12px' }}>
            8. 처리방침 시행일 및 변경 이력
          </h2>
          <p>
            본 방침은 2026년 5월 6일부터 시행됩니다.
            변경 시 사전 공지 후 시행일을 갱신합니다.
          </p>
        </article>
      </main>
      <Footer />
    </div>
  )
}
