import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type AdCampaign = Database['public']['Tables']['ad_campaigns']['Row']

export interface AdRoiRow {
  campaignId: string
  title: string
  impressions: number
  clicks: number
  conversions: number
  ctr: number | null // null when clicks === 0 (divide-by-zero 방지)
  anomaly: boolean
}

/**
 * 캠페인별 ROI 집계 — impressions/clicks/conversions/ctr/anomaly
 *
 * 어드민 전용 (createSupabaseAdminClient() 경유 필수).
 * MVP 규모: 캠페인 수가 적으므로 루프 방식 허용.
 */
export async function getAdRoiStats(
  adminClient: SupabaseClient<Database>,
): Promise<AdRoiRow[]> {
  const { data: campaigns } = await adminClient
    .from('ad_campaigns')
    .select('id, title')
    .order('created_at', { ascending: false })

  if (!campaigns || campaigns.length === 0) return []

  const campaignIds = campaigns.map(c => c.id)
  const { data: allEvents } = await adminClient
    .from('ad_events')
    .select('campaign_id, event_type, is_anomaly')
    .in('campaign_id', campaignIds)

  type EventRow = { campaign_id: string; event_type: string; is_anomaly: boolean }
  const byId = new Map<string, EventRow[]>()
  for (const ev of (allEvents ?? []) as EventRow[]) {
    const list = byId.get(ev.campaign_id) ?? []
    list.push(ev)
    byId.set(ev.campaign_id, list)
  }

  return campaigns.map(c => {
    const ev = byId.get(c.id) ?? []
    const impressions = ev.filter(e => e.event_type === 'impression').length
    const clicks      = ev.filter(e => e.event_type === 'click').length
    const conversions = ev.filter(e => e.event_type === 'conversion').length
    const anomaly     = ev.some(e => e.is_anomaly)
    const ctr         = clicks > 0 ? (conversions / clicks) * 100 : null
    return { campaignId: c.id, title: c.title, impressions, clicks, conversions, ctr, anomaly }
  })
}

// CRITICAL: 반드시 now() BETWEEN starts_at AND ends_at AND status='approved' 포함 (CLAUDE.md)
export async function getActiveAds(
  placement: 'banner_top' | 'sidebar' | 'in_feed' | 'map_popup',
  supabase: SupabaseClient<Database>,
  sggCode?: string,
): Promise<AdCampaign[]> {
  const now = new Date().toISOString()
  let query = supabase
    .from('ad_campaigns')
    .select('*')
    .eq('placement', placement)
    .eq('status', 'approved')
    .lte('starts_at', now)
    .gte('ends_at', now)
    .order('created_at')

  if (sggCode) {
    // 해당 지역 광고 + 전체 지역 광고(null) 모두 반환
    query = query.or(`target_sgg_code.is.null,target_sgg_code.eq.${sggCode}`)
  }

  if (placement === 'map_popup') {
    // 위치 정보가 있는 캠페인만 반환
    query = query.not('target_lat', 'is', null).not('target_lng', 'is', null)
  }

  const { data } = await query
  return data ?? []
}

export async function getAdCampaignById(
  id: string,
  supabase: SupabaseClient<Database>,
): Promise<AdCampaign | null> {
  const { data } = await supabase
    .from('ad_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data ?? null
}

export async function getAllAdCampaigns(
  supabase: SupabaseClient<Database>,
): Promise<AdCampaign[]> {
  const { data } = await supabase
    .from('ad_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}
