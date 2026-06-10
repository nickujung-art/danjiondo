import type { MetadataRoute } from 'next'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import { getComplexesForSitemap, encodeSlug } from '@/lib/data/sitemap'

export const revalidate = 86400

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createReadonlyClient()
  const complexes = await getComplexesForSitemap(supabase)

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,        lastModified: new Date(), changeFrequency: 'daily',  priority: 1 },
    { url: `${SITE}/map`,     lastModified: new Date(), changeFrequency: 'daily',  priority: 0.9 },
    { url: `${SITE}/invest`,  lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/presale`, lastModified: new Date(), changeFrequency: 'daily',  priority: 0.8 },
  ]

  // 계층 URL 집계 (si / gu / dong 레벨)
  const siSet   = new Set<string>()
  const guSet   = new Set<string>()
  const dongSet = new Set<string>()

  for (const c of complexes) {
    if (c.si) siSet.add(c.si)
    if (c.si && c.gu) guSet.add(`${c.si}/${c.gu}`)
    if (c.url_slug) {
      const parts = c.url_slug.split('/')
      // dong 레벨: url_slug에서 마지막 세그먼트(단지명) 제거
      if (parts.length >= 3) dongSet.add(parts.slice(0, parts.length - 1).join('/'))
    }
  }

  const hierarchyRoutes: MetadataRoute.Sitemap = [
    ...[...siSet].map(si => ({
      url:             `${SITE}/${encodeURIComponent(si)}`,
      lastModified:    new Date(),
      changeFrequency: 'weekly' as const,
      priority:        0.9,
    })),
    ...[...guSet].map(slug => ({
      url:             `${SITE}/${encodeSlug(slug)}`,
      lastModified:    new Date(),
      changeFrequency: 'weekly' as const,
      priority:        0.8,
    })),
    ...[...dongSet].map(slug => ({
      url:             `${SITE}/${encodeSlug(slug)}`,
      lastModified:    new Date(),
      changeFrequency: 'weekly' as const,
      priority:        0.7,
    })),
  ]

  const complexRoutes: MetadataRoute.Sitemap = complexes.map(c => ({
    // D-09: url_slug 없는 ~143개는 기존 UUID URL 유지
    url:             c.url_slug
      ? `${SITE}/${encodeSlug(c.url_slug)}`
      : `${SITE}/complexes/${c.id}`,
    lastModified:    new Date(c.updated_at),
    changeFrequency: 'weekly' as const,
    priority:        0.8,
  }))

  return [...staticRoutes, ...hierarchyRoutes, ...complexRoutes]
}
