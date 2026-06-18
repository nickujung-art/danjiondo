import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron-auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { buildWeeklyDigest } from '@/lib/notifications/digest'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()

  try {
    const { inserted } = await buildWeeklyDigest(supabase)
    return NextResponse.json({ inserted })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('digest worker error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
