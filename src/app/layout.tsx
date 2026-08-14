import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Footer } from '@/components/layout/Footer'
import { AppHeader } from '@/components/layout/AppHeader'
import { BottomTabBar } from '@/components/layout/BottomTabBar'
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
  /*
    사이트 폐지 — 전 페이지 색인 제외(2026-08-14). 근거·주의사항은 `src/lib/seo/retire.ts` 참고.

    [왜 루트 metadata 인가]
    미들웨어가 아니라 여기 거는 게 핵심이다. `src/middleware.ts` 의 matcher 는 `/api/*` 까지
    포함해서, 폐지 로직을 거기 넣으면 **크론 5종이 통째로 죽는다**(notify·digest·cafe-code·
    cafe-ingest·rankings). metadata 는 페이지에만 붙으므로 구조적으로 API 에 닿을 수 없다.
    전수 확인 결과 `robots:` 를 자체 지정한 페이지가 하나도 없어 여기서 걸면 전부 적용된다.

    [`follow` 를 남기는 이유]
    `nofollow` 로 막으면 페이지 안 링크로 신호가 흐르지 못한다. 폐지 중인 사이트는
    `noindex, follow` 가 권장 조합이다.

    [301 이전은 하지 않기로 했다 — 시도했다가 접었다]
    창원·김해 단지 페이지를 실거래이야기의 등가 페이지로 301 하려 했다(DB 공유라 단지 UUID 가
    같아 매핑이 확실했다). 그런데 **이 앱에서는 서버 컴포넌트의 `permanentRedirect()` 가
    동작하지 않는다** — 무조건 리다이렉트를 페이지 최상단에 놓아도 200 이 나왔다.
    호출은 되고 있었다(로그로 확인) 지만 응답이 리다이렉트가 아니었다. ISR 캐시·포트 점유는
    배제했고, Sentry 서버 컴포넌트 래핑이나 빌드 타임 env 인라이닝이 후보로 남았다.
    **원인을 못 찾은 걸 배포하지 않는다.**

    다행히 손해가 크지 않다. 브랜드 도메인 `danjiondo.com` 과 `danjiondo.kr` 이 **둘 다 이미
    죽어 있어**(2026-08-14 확인) 남은 `*.vercel.app` 서브도메인에는 물려받을 검색 권위가
    거의 없다. 원래 목표도 "가치 이전"이 아니라 **"중복 제거"** 였고 그건 이 noindex 가 한다.
    오래된 북마크는 기존 페이지를 그대로 보게 된다 — 정보가 틀리지는 않는다.

    나중에 다시 한다면 미들웨어가 유력하다(`NextResponse.redirect` 는 이 앱에서 이미 동작한다,
    PROTECTED 경로 참고). 다만 **미들웨어 matcher 가 `/api/*` 를 포함하므로 반드시 API 를
    먼저 제외해야 한다** — 안 그러면 크론 5종이 죽는다.

    [sitemap·robots 는 지금 건드리지 않는다 — 의도된 것]
    구글이 이 태그를 **보려면 크롤을 해야** 색인에서 뺀다. sitemap 을 먼저 지우거나
    robots 로 막으면 크롤이 줄어 **오히려 색인이 오래 남는다**(robots Disallow 는 noindex 를
    아예 못 보게 만드는 가장 흔한 실수다). 색인이 빠진 걸 확인한 뒤에 걷는다.
  */
  robots: {
    index: false,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#ea580c',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',  // iOS env(safe-area-inset-bottom) 활성화
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
      <body className="font-sans antialiased pb-[calc(64px+env(safe-area-inset-bottom,0px))] sm:pb-0">
        <AppHeader />
        <NuqsAdapter>
          {children}
        </NuqsAdapter>
        <div className="hidden sm:block">
          <Footer />
        </div>
        <BottomTabBar />
      </body>
    </html>
  )
}
