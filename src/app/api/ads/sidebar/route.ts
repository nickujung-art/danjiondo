import { type NextRequest, NextResponse } from 'next/server'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import { getActiveAds } from '@/lib/data/ads'
import type { AdCampaign } from '@/lib/data/ads'

export const dynamic = 'force-dynamic'

const VALID_SGG_CODES = new Set(['48121', '48123', '48125', '48127', '48129', '48250', '48720'])

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const raw = searchParams.get('sgg_code')
  const sggCode = raw && VALID_SGG_CODES.has(raw) ? raw : undefined

  const supabase = createReadonlyClient()

  // CRITICAL: getActiveAds enforces now() BETWEEN starts_at AND ends_at AND status='approved'
  const ads: AdCampaign[] = await getActiveAds('sidebar', supabase, sggCode)

  return NextResponse.json(
    { ads },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
