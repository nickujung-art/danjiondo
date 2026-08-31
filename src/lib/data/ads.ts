import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { SITE_ID, type SiteIdFilter } from '@/lib/data/site'

export type AdCampaign = Database['public']['Tables']['ad_campaigns']['Row']

export interface AdRoiRow {
  campaignId: string
  siteId: string
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
  siteId: SiteIdFilter,
): Promise<AdRoiRow[]> {
  let query = adminClient
    .from('ad_campaigns')
    .select('id, title, site_id')
    .order('created_at', { ascending: false })
  if (siteId !== 'all') query = query.eq('site_id', siteId)
  const { data: campaigns } = await query

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
    return { campaignId: c.id, siteId: c.site_id, title: c.title, impressions, clicks, conversions, ctr, anomaly }
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
    // CRITICAL: ad_campaigns 는 danjiondo·realtrade-story·changbuletter 가 한 Supabase
    // 프로젝트에서 공유한다. 사이트 분리는 RLS 가 아니라 이 필터가 한다 — 빠뜨리면
    // 남의 사이트 광고가 이 사이트 화면에 그대로 노출된다 (src/lib/data/site.ts).
    .eq('site_id', SITE_ID)
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
  siteId: SiteIdFilter,
): Promise<AdCampaign | null> {
  let query = supabase
    .from('ad_campaigns')
    .select('*')
    .eq('id', id)
  if (siteId !== 'all') query = query.eq('site_id', siteId)
  const { data } = await query.maybeSingle()
  return data ?? null
}

export async function getAllAdCampaigns(
  supabase: SupabaseClient<Database>,
  siteId: SiteIdFilter,
): Promise<AdCampaign[]> {
  let query = supabase
    .from('ad_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
  if (siteId !== 'all') query = query.eq('site_id', siteId)
  const { data } = await query
  return data ?? []
}
