import { createReadonlyClient } from '@/lib/supabase/readonly'

export const revalidate = 3600  // 1시간 캐시 (일배치 04:00 KST 기준 충분)

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'

function encodeSlug(slug: string): string {
  return slug.split('/').map(encodeURIComponent).join('/')
}

export async function GET(): Promise<Response> {
  const supabase = createReadonlyClient()

  // CLAUDE.md: cancel_date IS NULL AND superseded_by IS NULL 필수
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id, price, area_m2, deal_date,
      complex_id,
      complexes!inner(canonical_name, si, gu, dong, url_slug)
    `)
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .not('complex_id', 'is', null)
    .order('deal_date', { ascending: false })
    .limit(50)

  const pubDate = new Date().toUTCString()

  const items = (transactions ?? []).map(tx => {
    // Pitfall 4: foreign table join 타입 assertion
    const c = tx.complexes as {
      canonical_name: string
      si: string | null
      gu: string | null
      dong: string | null
      url_slug: string | null
    }

    const location    = [c.si, c.gu, c.dong].filter(Boolean).join(' ')
    const priceOk     = Math.floor((tx.price as number) / 10000)
    const areaPy      = Math.round((tx.area_m2 as number) / 3.3058)
    const link        = c.url_slug
      ? `${SITE}/${encodeSlug(c.url_slug)}`
      : `${SITE}/complexes/${tx.complex_id}`
    const title       = `${c.canonical_name} ${areaPy}평 ${priceOk}억 (${tx.deal_date})`
    const itemPubDate = new Date(tx.deal_date as string).toUTCString()

    // RSS CDATA: canonical_name에 ]]> 없음 확인됨 (RESEARCH.md Pitfall A4)
    return `<item>
    <title><![CDATA[${title}]]></title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <description><![CDATA[${location} ${c.canonical_name} 실거래: ${priceOk}억 (${areaPy}평)]]></description>
    <pubDate>${itemPubDate}</pubDate>
  </item>`
  }).join('\n')

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>단지온도 - 창원·김해 최신 실거래가</title>
  <link>${SITE}</link>
  <description>창원·김해 아파트 최신 실거래가 50건. 오늘 신고된 거래를 빠르게 확인하세요.</description>
  <language>ko</language>
  <lastBuildDate>${pubDate}</lastBuildDate>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>`

  return new Response(rss, {
    headers: {
      'Content-Type':  'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
