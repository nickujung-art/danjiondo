import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { adEventRatelimit, adClickDailyLimit } from '@/lib/ratelimit'

export const runtime = 'nodejs'

const ALLOWED_EVENT_TYPES = ['impression', 'click', 'conversion'] as const

export async function POST(request: Request): Promise<NextResponse> {
  // 1. IP 추출 (D-07)
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? '127.0.0.1'

  // 2. Rate limit 체크 (D-06 — slidingWindow 100/1m)
  const { success, reset } = await adEventRatelimit.limit(ip)
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      },
    )
  }

  // 3. Body 파싱 + 검증
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  if (!b || typeof b.campaign_id !== 'string' || !b.campaign_id) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
  }

  const eventType = b.event_type as string
  if (!(ALLOWED_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return NextResponse.json({ error: 'invalid event_type' }, { status: 400 })
  }

  // 4. IP hash 생성 — PII 비저장 (D-07, T-06-01-01)
  const secret = process.env.RATE_LIMIT_SECRET ?? ''
  const ip_hash = createHash('sha256').update(`${ip}:${secret}`).digest('hex')

  // 5. click 이벤트에서만 일별 anomaly 감지 (D-03, T-06-01-01)
  let is_anomaly = false
  if (eventType === 'click') {
    const dailyResult = await adClickDailyLimit.limit(ip_hash)
    if (!dailyResult.success) {
      is_anomaly = true
    }
  }

  // 6. admin client로 INSERT (SEC-02 — createSupabaseAdminClient() 단일 경유)
  const supabase = createSupabaseAdminClient()
  // supabase-js는 실패에 예외를 던지지 않는다. error를 보지 않으면 INSERT가 통째로
  // 실패해도 201 ok가 나가고, 광고 노출·클릭 집계가 조용히 비어 간다(정산 데이터다).
  const { error } = await supabase.from('ad_events').insert({
    campaign_id: b.campaign_id,
    event_type: eventType,
    ip_hash,
    is_anomaly,
  })
  if (error) {
    console.error(`[ads/events] ${eventType} 적재 실패 (campaign=${b.campaign_id}): ${error.message}`)
    return NextResponse.json({ ok: false, error: 'event insert failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
