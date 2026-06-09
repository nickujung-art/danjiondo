/**
 * SEO URL slug 유틸리티 — Phase 23
 *
 * D-01: 한글 그대로 사용 (로마자 변환 없음)
 * D-02: 창원시(gu 있음) → 4단계 / 김해시(gu 없음) → 3단계
 * import 'server-only' 없음 — scripts/backfill-url-slugs.ts에서도 직접 import 가능
 */

/** DB url_slug 컬럼값 생성. 마이그레이션 SQL CASE 표현식과 동일 로직 */
export function buildUrlSlug(
  si: string | null,
  gu: string | null,
  dong: string | null,
  canonicalName: string | null,
): string | null {
  if (!si || !dong || !canonicalName) return null
  return gu
    ? `${si}/${gu}/${dong}/${canonicalName}`
    : `${si}/${dong}/${canonicalName}`
}

/** catch-all slug 배열로 페이지 타입 판별 */
export type SlugPageType = 'si' | 'gu' | 'dong-or-complex' | 'complex' | 'invalid'

export function classifySlug(slug: string[]): SlugPageType {
  if (slug.length === 1) return 'si'
  if (slug.length === 2) return 'gu'
  if (slug.length === 3) return 'dong-or-complex'
  if (slug.length === 4) return 'complex'
  return 'invalid'
}

/**
 * 한글 URL을 canonical URL string으로 인코딩
 * sitemap.ts의 encodeSlug와 동일 목적 — 각 세그먼트 encodeURIComponent
 */
export function buildCanonicalUrl(site: string, slug: string[]): string {
  return `${site}/${slug.map(encodeURIComponent).join('/')}`
}
