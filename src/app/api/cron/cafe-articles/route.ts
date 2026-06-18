import { verifyCronSecret } from '@/lib/cron-auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { searchCafeArticles } from '@/services/naver-cafe'
import { ingestCafeArticles } from '@/lib/data/cafe-articles'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  // NAVER_TARGET_CAFE 환경변수로 수집할 카페 슬러그 지정 (미설정 시 전체 카페)
  const cafeSlug = process.env.NAVER_TARGET_CAFE ?? ''

  const errors: string[] = []
  let totalIngested = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createSupabaseAdminClient() as any

  // 세대수 기준 내림차순 — 큰 단지일수록 카페 언급 가능성 높음
  const { data: complexes, error: complexError } = await supabase
    .from('complexes')
    .select('id, canonical_name, si')
    .not('canonical_name', 'is', null)
    .not('si', 'is', null)
    .order('household_count', { ascending: false, nullsFirst: false })
    .limit(250)

  if (complexError) {
    return Response.json({ ok: false, errors: [complexError.message] }, { status: 500 })
  }

  for (const complex of (complexes ?? [])) {
    const c = complex as { id: string; canonical_name: string; si: string }
    try {
      const query = `${c.canonical_name} ${c.si}`
      const articles = await searchCafeArticles(query, 30, cafeSlug || undefined, c.canonical_name)
      if (articles.length > 0) {
        const ingested = await ingestCafeArticles(c.id, articles, supabase)
        totalIngested += ingested
      }
    } catch (err) {
      errors.push(`complex=${c.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return Response.json({
    ok: errors.length === 0,
    totalIngested,
    complexCount: (complexes ?? []).length,
    cafeSlug: cafeSlug || '(전체)',
    errors,
  })
}
