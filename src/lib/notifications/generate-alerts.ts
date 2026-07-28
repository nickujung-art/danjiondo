import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { getMemberTier, getNotificationDelay } from '@/lib/data/member-tier'

function formatPrice(price: number): string {
  const uk = Math.floor(price / 10000)
  const man = price % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}만`
  if (uk > 0) return `${uk}억`
  return `${price.toLocaleString()}만`
}

export async function generatePriceAlerts(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const newHighCount = await generateNewHighAlerts(supabase)
  const conditionalCount = await generateConditionalAlerts(supabase)
  return newHighCount + conditionalCount
}

interface AlertInsertParams {
  userId:     string
  complexId:  string
  eventType:  string
  dedupeKey:  string
  title:      string
  body:       string
  data:       Json
}

async function insertAlertIfNew(
  supabase: SupabaseClient<Database>,
  params: AlertInsertParams,
): Promise<number> {
  // UNIQUE(user_id, event_type, target_id, dedupe_key) 충돌 시 무시
  const { error } = await supabase.from('notifications').insert({
    user_id:    params.userId,
    type:       'price_alert',
    event_type: params.eventType,
    target_id:  params.complexId,
    dedupe_key: params.dedupeKey,
    title:      params.title,
    body:       params.body,
    data:       params.data,
  })

  return error ? 0 : 1
}

// danjiondo — 관심단지 최근 7일 신고가 갱신 시 무조건 알림 (기존 동작 보존)
async function generateNewHighAlerts(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]!

  // 최근 7일 매매 거래 (유효 건만)
  const { data: recentTxns } = await supabase
    .from('transactions')
    .select(
      `complex_id, price, area_m2, deal_date,
       complexes!inner (canonical_name)`,
    )
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', sevenDaysAgo)
    .order('price', { ascending: false })
    .limit(200)

  if (!recentTxns?.length) return 0

  // 최고가 1건/단지 추출
  const topByComplex = new Map<string, { price: number; deal_date: string; name: string }>()
  for (const t of recentTxns) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = t as any
    const c = Array.isArray(r.complexes) ? r.complexes[0] : r.complexes
    if (!c) continue
    if (!topByComplex.has(r.complex_id)) {
      topByComplex.set(r.complex_id, {
        price:      r.price as number,
        deal_date:  r.deal_date as string,
        name:       c.canonical_name as string,
      })
    }
  }

  const complexIds = [...topByComplex.keys()]
  if (!complexIds.length) return 0

  // 해당 단지를 관심등록하고 알림 on인 danjiondo 유저
  const { data: favs } = await supabase
    .from('favorites')
    .select('user_id, complex_id')
    .in('complex_id', complexIds)
    .eq('site_id', 'danjiondo')
    .eq('alert_enabled', true)

  if (!favs?.length) return 0

  let created = 0

  for (const fav of favs) {
    const top = topByComplex.get(fav.complex_id)
    if (!top) continue

    created += await insertAlertIfNew(supabase, {
      userId:    fav.user_id,
      complexId: fav.complex_id,
      eventType: 'price_high',
      dedupeKey: top.deal_date,
      title:     `${top.name} 신고가 갱신`,
      body:      `${formatPrice(top.price)}원 실거래 (${top.deal_date})`,
      data:      { complex_id: fav.complex_id, price: top.price, deal_date: top.deal_date },
    })
  }

  return created
}

interface ScopedTransaction {
  price:     number
  deal_date: string
  name:      string
}

// 최근 7일 내 최저가 거래 1건 (area_type_id 설정 시 해당 평형만)
async function getScopedRecentLow(
  supabase: SupabaseClient<Database>,
  complexId: string,
  areaTypeId: string | null,
): Promise<ScopedTransaction | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]!

  let query = supabase
    .from('transactions')
    .select(`price, deal_date, complexes!inner (canonical_name)`)
    .eq('complex_id', complexId)
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', sevenDaysAgo)
    .order('price', { ascending: true })
    .limit(1)

  if (areaTypeId) query = query.eq('area_type_id', areaTypeId)

  const { data } = await query.maybeSingle()
  if (!data) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any
  const c = Array.isArray(r.complexes) ? r.complexes[0] : r.complexes
  if (!c) return null

  return { price: r.price as number, deal_date: r.deal_date as string, name: c.canonical_name as string }
}

// 전고점 — 스냅샷 없이 매번 실거래 이력에서 재계산 (area_type_id 설정 시 해당 평형만)
async function getHistoricalPeak(
  supabase: SupabaseClient<Database>,
  complexId: string,
  areaTypeId: string | null,
): Promise<number | null> {
  let query = supabase
    .from('transactions')
    .select('price')
    .eq('complex_id', complexId)
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .order('price', { ascending: false })
    .limit(1)

  if (areaTypeId) query = query.eq('area_type_id', areaTypeId)

  const { data } = await query.maybeSingle()
  return (data as { price: number } | null)?.price ?? null
}

// realtrade-story — 절대가/전고점 대비 하락률 조건부 가격알림
async function generateConditionalAlerts(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { data: favs } = await supabase
    .from('favorites')
    .select('user_id, complex_id, area_type_id, price_alert_threshold, price_drop_rate_threshold')
    .eq('site_id', 'realtrade-story')
    .eq('alert_enabled', true)
    .or('price_alert_threshold.not.is.null,price_drop_rate_threshold.not.is.null')

  if (!favs?.length) return 0

  let created = 0

  for (const fav of favs) {
    const low = await getScopedRecentLow(supabase, fav.complex_id, fav.area_type_id)
    if (!low) continue

    const dedupeSuffix = fav.area_type_id ?? 'any'

    if (fav.price_alert_threshold != null && low.price <= fav.price_alert_threshold) {
      created += await insertAlertIfNew(supabase, {
        userId:    fav.user_id,
        complexId: fav.complex_id,
        eventType: 'price_below_threshold',
        dedupeKey: `${low.deal_date}:${dedupeSuffix}`,
        title:     `${low.name} 관심 가격 도달`,
        body:      `${formatPrice(low.price)}원 실거래 (${low.deal_date}) — 설정하신 ${formatPrice(fav.price_alert_threshold)}원 이하`,
        data:      {
          complex_id: fav.complex_id, price: low.price, deal_date: low.deal_date,
          threshold: fav.price_alert_threshold, area_type_id: fav.area_type_id,
        },
      })
    }

    if (fav.price_drop_rate_threshold != null) {
      const peak = await getHistoricalPeak(supabase, fav.complex_id, fav.area_type_id)
      if (!peak || peak <= 0) continue

      const dropPct = ((peak - low.price) / peak) * 100
      if (dropPct >= fav.price_drop_rate_threshold) {
        created += await insertAlertIfNew(supabase, {
          userId:    fav.user_id,
          complexId: fav.complex_id,
          eventType: 'price_drop_rate',
          dedupeKey: `${low.deal_date}:${dedupeSuffix}`,
          title:     `${low.name} 전고점 대비 하락`,
          body:      `${formatPrice(low.price)}원 실거래 (${low.deal_date}) — 전고점 대비 ${dropPct.toFixed(1)}% 하락`,
          data:      {
            complex_id: fav.complex_id, price: low.price, deal_date: low.deal_date,
            peak, drop_pct: Math.round(dropPct * 10) / 10, area_type_id: fav.area_type_id,
          },
        })
      }
    }
  }

  return created
}

/**
 * DIFF-05: 등급별 알림 발송 우선순위
 * gold → 즉시(딜레이 0ms), silver/bronze → 생성 30분 후
 */
export async function shouldDeliverNow(
  userId: string,
  supabase: SupabaseClient<Database>,
  notificationCreatedAt: Date,
): Promise<boolean> {
  const { tier } = await getMemberTier(userId, supabase)
  const delayMs = getNotificationDelay(tier)

  if (delayMs === 0) return true

  const elapsedMs = Date.now() - notificationCreatedAt.getTime()
  return elapsedMs >= delayMs
}
