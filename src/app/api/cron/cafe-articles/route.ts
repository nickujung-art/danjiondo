import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { searchCafeArticles } from '@/services/naver-cafe'
import { ingestCafeArticles } from '@/lib/data/cafe-articles'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const errors: string[] = []
  let totalIngested = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createSupabaseAdminClient() as any

  // Naver API 한도: 25,000 calls/day. 100건/단지 * 250단지 = 25,000 (D-16)
  const { data: complexes, error: complexError } = await supabase
    .from('complexes')
    .select('id, canonical_name, si')
    .not('canonical_name', 'is', null)
    .not('si', 'is', null)
    .limit(250)

  if (complexError) {
    return Response.json({ ok: false, errors: [complexError.message] }, { status: 500 })
  }

  for (const complex of (complexes ?? [])) {
    const c = complex as { id: string; canonical_name: string; si: string }
    try {
      // D-14: 검색 쿼리 = {canonical_name} {si}
      const query = `${c.canonical_name} ${c.si}`
      const articles = await searchCafeArticles(query, 100)
      const ingested = await ingestCafeArticles(c.id, articles, supabase)
      totalIngested += ingested
    } catch (err) {
      errors.push(`complex=${c.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return Response.json({ ok: errors.length === 0, totalIngested, complexCount: (complexes ?? []).length, errors })
}
