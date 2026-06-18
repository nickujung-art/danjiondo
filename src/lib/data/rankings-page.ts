import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// ── 창원·김해 활성 SGG 코드 ─────────────────────────────────────────────────
const ACTIVE_SGG_CODES = ['48121', '48123', '48125', '48127', '48129', '48250'] as const

// 지역 그룹 (대장단지 champion 계산용, D-05)
const CHANWON_SGG = ['48121', '48123'] as const           // 의창 + 성산
const MASAN_SGG   = ['48125', '48127', '48129'] as const  // 마산합포 + 마산회원 + 진해
const GIMHAE_SGG  = ['48250'] as const                    // 김해

// ── 지역 랭킹 탭 정의 (D-04 결정사항) ──────────────────────────────────────
export const REGION_TABS = [
  { key: 'all',   label: '창원 전체',  sggCodes: ['48121', '48123', '48125', '48127', '48129'] },
  { key: '48121', label: '의창구',     sggCodes: ['48121'] },
  { key: '48123', label: '성산구',     sggCodes: ['48123'] },
  { key: '48125', label: '마산합포구', sggCodes: ['48125'] },
  { key: '48127', label: '마산회원구', sggCodes: ['48127'] },
  { key: '48129', label: '진해구',     sggCodes: ['48129'] },
  { key: '48250', label: '김해시',     sggCodes: ['48250'] },
] as const

// ── 타입 정의 ────────────────────────────────────────────────────────────────

export interface DailyFeedTransaction {
  id: string
  price: number          // 만원
  area_m2: number
  floor: number | null
  deal_date: string      // YYYY-MM-DD
  dong: string | null
  is_new_high: boolean   // 같은 단지 ±5㎡ 면적대 역대 최고가 비교 (D-03)
  complexId: string
  complexName: string
  urlSlug: string | null
}

export interface DailyFeedGroup {
  date: string           // YYYY-MM-DD
  transactions: DailyFeedTransaction[]
}

export interface RegionalRankingRow {
  rank: number
  complexId: string
  complexName: string
  urlSlug: string | null
  si: string | null
  gu: string | null
  avgPricePerPyeong: number       // 만원/평
  recentTradePrice: number | null // 만원
  txCount30d: number
}

export interface ChampionComplex {
  complexId: string
  complexName: string
  urlSlug: string | null
  si: string | null
  gu: string | null
  avgPricePerPyeong: number      // 만원/평
  priceChange30d: number | null  // 비율 (0.105 = +10.5%)
  txCount90d: number             // 최근 90일 거래 건수 (D-05: 3개월 기준)
}

export interface ChampionComplexes {
  chanwon: ChampionComplex | null
  masan: ChampionComplex | null
  gimhae: ChampionComplex | null
}

export interface WeeklyHighlights {
  topPriceThisWeek: Array<{
    complexId: string
    complexName: string
    urlSlug: string | null
    si: string | null
    gu: string | null
    price: number      // 만원
    area_m2: number
    deal_date: string
  }>
  topVolumeThisMonth: Array<{
    complexId: string
    complexName: string
    urlSlug: string | null
    si: string | null
    gu: string | null
    txCount30d: number
  }>
  priceSurgeLastMonth: Array<{
    complexId: string
    complexName: string
    urlSlug: string | null
    si: string | null
    gu: string | null
    changeRatio: number  // 0.20 = +20%
  }>
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

function nDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0]!
}

// ── 1. 일별 실거래 피드 (D-02, D-03) ─────────────────────────────────────────

/**
 * 최근 N일 실거래 피드를 날짜별 그룹핑해 반환한다.
 * - deal_type='sale' 전용, 취소·정정 제외
 * - 날짜 내림차순, 각 날짜 내 price 내림차순
 * - 날짜당 최대 50건
 * - is_new_high: 같은 단지 ±5㎡ 면적대 역대 최고가와 비교 (D-03)
 *   TypeScript 2-query 방식 — complexes.all_time_high 컬럼 불필요
 */
export async function getRecentDailyFeed(
  supabase: SupabaseClient<Database>,
  days = 7,
): Promise<DailyFeedGroup[]> {
  const since = nDaysAgo(days)

  // ── Query 1: 최근 피드 거래 ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: feedData, error } = await (supabase as any)
    .from('transactions')
    .select(`
      id, price, area_m2, floor, deal_date,
      complexes!inner (id, canonical_name, dong, url_slug, sgg_code)
    `)
    .in('complexes.sgg_code', [...ACTIVE_SGG_CODES])
    .gte('deal_date', since)
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .order('deal_date', { ascending: false })
    .order('price', { ascending: false })
    .limit(days * 50 + 50)

  if (error) {
    console.error('[getRecentDailyFeed] failed:', error.message)
    return []
  }

  const feedRows = (feedData ?? []) as Record<string, unknown>[]
  if (feedRows.length === 0) return []

  // ── Query 2: 역대 이력 거래 (is_new_high ±5㎡ 비교용) ──────────────────────
  const feedComplexIds = [...new Set(
    feedRows.map(r => {
      const c = Array.isArray(r['complexes'])
        ? (r['complexes'] as Record<string, unknown>[])[0]
        : r['complexes'] as Record<string, unknown>
      return c?.['id'] as string | undefined
    }).filter((id): id is string => Boolean(id))
  )]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: histData } = await (supabase as any)
    .from('transactions')
    .select('id, complex_id, area_m2, price')
    .in('complex_id', feedComplexIds)
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .limit(10000)

  // Map<complexId, {id, area_m2, price}[]>
  const histByComplex = new Map<string, Array<{ id: string; area_m2: number; price: number }>>()
  for (const h of (histData ?? []) as Record<string, unknown>[]) {
    const cid = h['complex_id'] as string
    if (!histByComplex.has(cid)) histByComplex.set(cid, [])
    histByComplex.get(cid)!.push({
      id:      String(h['id']),
      area_m2: Number(h['area_m2']),
      price:   Number(h['price']),
    })
  }

  // ── 그룹핑 + is_new_high 계산 ───────────────────────────────────────────────
  const grouped = new Map<string, DailyFeedTransaction[]>()

  for (const row of feedRows) {
    const c = Array.isArray(row['complexes'])
      ? (row['complexes'] as Record<string, unknown>[])[0]
      : row['complexes'] as Record<string, unknown>
    if (!c) continue

    const date      = row['deal_date'] as string
    const price     = Number(row['price'])
    const area_m2   = Number(row['area_m2'])
    const txId      = String(row['id'])
    const complexId = c['id'] as string

    // ±5㎡ 같은 면적대 역대 최고가 비교 (자기 자신 제외)
    const history     = histByComplex.get(complexId) ?? []
    const comparables = history.filter(h => h.id !== txId && Math.abs(h.area_m2 - area_m2) <= 5)
    const maxPrice    = comparables.length > 0
      ? Math.max(...comparables.map(h => h.price))
      : 0
    // 비교 대상 없으면 is_new_high = false (첫 거래는 신고가 마크 보수적 처리)
    const is_new_high = comparables.length > 0 && price >= maxPrice

    if (!grouped.has(date)) grouped.set(date, [])
    const group = grouped.get(date)!
    if (group.length >= 50) continue

    group.push({
      id:          txId,
      price,
      area_m2,
      floor:       row['floor'] != null ? Number(row['floor']) : null,
      deal_date:   date,
      dong:        c['dong'] as string | null,
      is_new_high,
      complexId,
      complexName: c['canonical_name'] as string,
      urlSlug:     c['url_slug'] as string | null,
    })
  }

  // 날짜 내림차순 정렬 후 반환
  return Array.from(grouped.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, transactions]) => ({ date, transactions }))
}

// ── 2. 대장단지 (D-05) ───────────────────────────────────────────────────────

/**
 * 지역별 대장단지 (창원/마산/김해) 각 1위를 반환한다.
 * 점수 = tx_count_90d × avg_sale_per_pyeong (D-05: 최근 3개월 거래량 기준)
 */
export async function getChampionComplexes(
  supabase: SupabaseClient<Database>,
): Promise<ChampionComplexes> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('complexes')
    .select('id, canonical_name, url_slug, si, gu, sgg_code, avg_sale_per_pyeong, price_change_30d')
    .in('sgg_code', [...ACTIVE_SGG_CODES])
    .not('avg_sale_per_pyeong', 'is', null)
    .eq('status', 'active')

  if (error) {
    console.error('[getChampionComplexes] failed:', error.message)
    return { chanwon: null, masan: null, gimhae: null }
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) return { chanwon: null, masan: null, gimhae: null }

  // ── 최근 90일 거래 건수 (D-05: 3개월 기준) ──────────────────────
  const complexIds    = rows.map(r => r['id'] as string)
  const ninetyDaysAgo = nDaysAgo(90)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: txData } = await (supabase as any)
    .from('transactions')
    .select('complex_id')
    .in('complex_id', complexIds)
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .gte('deal_date', ninetyDaysAgo)

  const countMap = new Map<string, number>()
  for (const tx of (txData ?? []) as Record<string, unknown>[]) {
    const cid = tx['complex_id'] as string
    countMap.set(cid, (countMap.get(cid) ?? 0) + 1)
  }

  function bestInGroup(sggList: readonly string[]): ChampionComplex | null {
    const candidates = rows
      .filter(r => sggList.includes(r['sgg_code'] as string))
      .map(r => {
        const id           = r['id'] as string
        const tx_count_90d = countMap.get(id) ?? 0
        const avgPPyeong   = Number(r['avg_sale_per_pyeong'])
        return {
          complexId:         id,
          complexName:       r['canonical_name'] as string,
          urlSlug:           r['url_slug'] as string | null,
          si:                r['si'] as string | null,
          gu:                r['gu'] as string | null,
          avgPricePerPyeong: avgPPyeong,
          priceChange30d:    r['price_change_30d'] != null ? Number(r['price_change_30d']) : null,
          txCount90d:        tx_count_90d,
          score:             tx_count_90d * avgPPyeong,
        }
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)

    if (candidates.length === 0) return null
    const { score: _score, ...rest } = candidates[0]!
    return rest
  }

  return {
    chanwon: bestInGroup(CHANWON_SGG),
    masan:   bestInGroup(MASAN_SGG),
    gimhae:  bestInGroup(GIMHAE_SGG),
  }
}

// ── 3. 지역 랭킹 (D-04) ──────────────────────────────────────────────────────

/**
 * 특정 sgg_code 목록 내 평당가 TOP 20 단지를 반환한다.
 * - tx_count_30d > 0 (최근 거래 있는 단지만)
 * - avg_sale_per_pyeong 내림차순
 */
export async function getRegionalPriceRanking(
  supabase: SupabaseClient<Database>,
  sggCodes: string[],
): Promise<RegionalRankingRow[]> {
  if (sggCodes.length === 0) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: complexList, error: e1 } = await (supabase as any)
    .from('complexes')
    .select('id, canonical_name, url_slug, si, gu, avg_sale_per_pyeong, tx_count_30d')
    .in('sgg_code', sggCodes)
    .gt('tx_count_30d', 0)
    .not('avg_sale_per_pyeong', 'is', null)
    .eq('status', 'active')
    .order('avg_sale_per_pyeong', { ascending: false })
    .limit(20)

  if (e1) {
    console.error('[getRegionalPriceRanking] complexes query failed:', e1.message)
    return []
  }

  const rows = (complexList ?? []) as Record<string, unknown>[]
  if (rows.length === 0) return []

  const ids = rows.map(r => r['id'] as string)
  const thirtyDaysAgo = nDaysAgo(30)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: txData } = await (supabase as any)
    .from('transactions')
    .select('complex_id, price, deal_date')
    .in('complex_id', ids)
    .gte('deal_date', thirtyDaysAgo)
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .order('deal_date', { ascending: false })
    .limit(ids.length * 10)

  const latestPriceMap = new Map<string, number>()
  for (const tx of (txData ?? []) as Record<string, unknown>[]) {
    const cid = tx['complex_id'] as string
    if (!latestPriceMap.has(cid)) {
      latestPriceMap.set(cid, Number(tx['price']))
    }
  }

  return rows.map((r, idx) => ({
    rank:              idx + 1,
    complexId:         r['id'] as string,
    complexName:       r['canonical_name'] as string,
    urlSlug:           r['url_slug'] as string | null,
    si:                r['si'] as string | null,
    gu:                r['gu'] as string | null,
    avgPricePerPyeong: Number(r['avg_sale_per_pyeong']),
    recentTradePrice:  latestPriceMap.get(r['id'] as string) ?? null,
    txCount30d:        Number(r['tx_count_30d']),
  }))
}

// ── 4. 이번 주 흥미 지표 (D-06) ──────────────────────────────────────────────

/**
 * 주간/월간 흥미 지표:
 * - topPriceThisWeek: 이번 주(7일) 최고가 거래 TOP 3
 * - topVolumeThisMonth: tx_count_30d 기준 TOP 5 단지
 * - priceSurgeLastMonth: price_change_30d >= 0.20 (20% 이상) TOP 3
 */
export async function getWeeklyHighlights(
  supabase: SupabaseClient<Database>,
): Promise<WeeklyHighlights> {
  const sevenDaysAgo = nDaysAgo(7)

  const [priceResult, volumeResult, surgeResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('transactions')
      .select(`
        price, area_m2, deal_date,
        complexes!inner (id, canonical_name, url_slug, si, gu, sgg_code)
      `)
      .in('complexes.sgg_code', [...ACTIVE_SGG_CODES])
      .gte('deal_date', sevenDaysAgo)
      .eq('deal_type', 'sale')
      .is('cancel_date', null)
      .is('superseded_by', null)
      .order('price', { ascending: false })
      .limit(3),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('complexes')
      .select('id, canonical_name, url_slug, si, gu, tx_count_30d')
      .in('sgg_code', [...ACTIVE_SGG_CODES])
      .gt('tx_count_30d', 0)
      .eq('status', 'active')
      .order('tx_count_30d', { ascending: false })
      .limit(5),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('complexes')
      .select('id, canonical_name, url_slug, si, gu, price_change_30d')
      .in('sgg_code', [...ACTIVE_SGG_CODES])
      .gte('price_change_30d', 0.20)
      .gt('tx_count_30d', 0)
      .eq('status', 'active')
      .order('price_change_30d', { ascending: false })
      .limit(3),
  ])

  const topPriceThisWeek: WeeklyHighlights['topPriceThisWeek'] = []
  for (const row of ((priceResult.data ?? []) as Record<string, unknown>[])) {
    const c = Array.isArray(row['complexes']) ? row['complexes'][0] : row['complexes']
    if (!c) continue
    topPriceThisWeek.push({
      complexId:   (c as Record<string, unknown>)['id'] as string,
      complexName: (c as Record<string, unknown>)['canonical_name'] as string,
      urlSlug:     (c as Record<string, unknown>)['url_slug'] as string | null,
      si:          (c as Record<string, unknown>)['si'] as string | null,
      gu:          (c as Record<string, unknown>)['gu'] as string | null,
      price:       Number(row['price']),
      area_m2:     Number(row['area_m2']),
      deal_date:   row['deal_date'] as string,
    })
  }

  const topVolumeThisMonth: WeeklyHighlights['topVolumeThisMonth'] = (
    (volumeResult.data ?? []) as Record<string, unknown>[]
  ).map(r => ({
    complexId:   r['id'] as string,
    complexName: r['canonical_name'] as string,
    urlSlug:     r['url_slug'] as string | null,
    si:          r['si'] as string | null,
    gu:          r['gu'] as string | null,
    txCount30d:  Number(r['tx_count_30d']),
  }))

  const priceSurgeLastMonth: WeeklyHighlights['priceSurgeLastMonth'] = (
    (surgeResult.data ?? []) as Record<string, unknown>[]
  ).map(r => ({
    complexId:   r['id'] as string,
    complexName: r['canonical_name'] as string,
    urlSlug:     r['url_slug'] as string | null,
    si:          r['si'] as string | null,
    gu:          r['gu'] as string | null,
    changeRatio: Number(r['price_change_30d']),
  }))

  return { topPriceThisWeek, topVolumeThisMonth, priceSurgeLastMonth }
}
