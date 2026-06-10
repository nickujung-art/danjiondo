import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Footer } from '@/components/layout/Footer'
import './globals.css'

const pretendard = localFont({
  src: '../../public/fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
  weight: '100 900',
})

export const metadata: Metadata = {
  title: {
    default: '단지온도',
    template: '%s | 단지온도',
  },
  description: '창원·김해 실거래가와 동네 의견을 한 화면에서.',
  manifest: '/manifest.webmanifest',
  applicationName: '단지온도',
  keywords: ['창원 아파트', '김해 아파트', '실거래가', '부동산'],
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: '단지온도',
  },
}

export const viewport: Viewport = {
  themeColor: '#ea580c',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <head>
        {/* SEO-04: Naver Yeti 한국어 페이지 명시 (D-06) */}
        <meta httpEquiv="content-language" content="ko-kr" />
        {/* RSS autodiscovery — 네이버 서치어드바이저 RSS 등록용 (SEO-05 연계) */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="단지온도 최신 실거래가"
          href="/feed.xml"
        />
      </head>
      <body className="font-sans antialiased">
        <NuqsAdapter>
          {children}
        </NuqsAdapter>
        <Footer />
      </body>
    </html>
  )
}
