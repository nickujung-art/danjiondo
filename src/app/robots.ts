import type { MetadataRoute } from 'next'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow:    '/',
        disallow: ['/admin/', '/api/'],
      },
      {
        // SEO-06: 네이버 크롤러 명시적 허용 (크롤링 우선순위 신호)
        userAgent: 'Yeti',
        allow:    '/',
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
