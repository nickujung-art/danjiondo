import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import {
  renderCoverPreview,
  renderHighlightPreview,
  renderRankingPreview,
  renderDistrictChampionsPreview,
  renderClosingPreview,
} from '@/lib/cardnews/card-templates'

export const runtime = 'nodejs'

const RankingRowSchema = z.object({
  rank: z.number(),
  name: z.string().nullable(),
  subtitle: z.string().nullable().optional(),
  price: z.string().nullable(),
  priceUnit: z.string().optional(),
})

const TextOverridesSchema = z.object({
  coverTitle2: z.string().optional(),
  coverTitle3: z.string().optional(),
  coverCaption: z.string().optional(),
  highlightTitle: z.string().optional(),
  rankingHeader: z.string().optional(),
  closingHeading: z.string().optional(),
  closingDesc: z.string().optional(),
}).optional()

const RequestSchema = z.object({
  ranking: z.array(RankingRowSchema),
  week: z.string(),
  region: z.string(),
  area: z.string().nullable(),
  period: z.string(),
  source: z.string().default('국토교통부 실거래가 공개시스템'),
  topic: z.string().optional(),
  seriesType: z.string().optional(),
  subCaption: z.string().optional(),
  textOverrides: TextOverridesSchema,
})

export async function POST(request: Request): Promise<NextResponse> {
  // 어드민 권한 검증 (gps-approve/route.ts 패턴)
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (
    !['admin', 'superadmin'].includes(
      (profile as { role: string } | null)?.role ?? '',
    )
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const data = parsed.data

  try {
    const overrides = data.textOverrides

    const coverData = {
      week: data.week,
      region: data.region,
      area: data.area,
      subCaption: data.subCaption,
      topic: data.topic,
      overrides,
    }

    const cardSetData = {
      week: data.week,
      region: data.region,
      area: data.area,
      period: data.period,
      source: data.source,
      ranking: data.ranking,
      seriesType: data.seriesType,
      subCaption: data.subCaption,
      overrides,
    }

    const isDistrictChampions = data.topic === 'district_champions'

    const html = {
      cover: renderCoverPreview(coverData),
      highlight: renderHighlightPreview(cardSetData),
      ranking: isDistrictChampions
        ? renderDistrictChampionsPreview(cardSetData)
        : renderRankingPreview(cardSetData),
      closing: renderClosingPreview(cardSetData),
    }

    return NextResponse.json({ html })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'template error' },
      { status: 500 },
    )
  }
}
