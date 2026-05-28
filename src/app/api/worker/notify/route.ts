import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { generatePriceAlerts } from '@/lib/notifications/generate-alerts'
import { deliverPendingNotifications, deliverKakaoChannelNotifications } from '@/lib/notifications/deliver'
import { markCronSuccess, markCronFailed } from '@/lib/data/cron-status'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()

  try {
    const generated = await generatePriceAlerts(supabase)
    const { sent, failed } = await deliverPendingNotifications(supabase)
    const { sent: kakaoSent, failed: kakaoFailed } = await deliverKakaoChannelNotifications(supabase)
    await markCronSuccess(supabase, 'notify-worker')
    return NextResponse.json({ generated, sent, failed, kakaoSent, kakaoFailed })
  } catch (err) {
    await markCronFailed(supabase, 'notify-worker')
    throw err
  }
}
