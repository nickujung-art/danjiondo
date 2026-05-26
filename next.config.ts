import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'
import { withSentryConfig } from '@sentry/nextjs'

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "font-src 'self' cdn.jsdelivr.net",
              "script-src 'self' 'unsafe-inline' *.kakao.com *.daumcdn.net",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: *.kakao.com *.daumcdn.net *.supabase.co placehold.co",
              "connect-src 'self' *.supabase.co *.posthog.com *.sentry.io api.voyageai.com api.anthropic.com *.kakao.com *.daumcdn.net",
              "frame-src 'none'",
              "object-src 'none'",
            ].join('; '),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default withSentryConfig(
  withSerwist(nextConfig),
  {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.CI,
  },
)
