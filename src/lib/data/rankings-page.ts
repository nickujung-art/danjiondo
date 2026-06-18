import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// ── 창원·김해 활성 SGG 코드 ─────────────────────────────────────────────────
const ACTIVE_SGG_CODES = ['48121', '48123', '48125', '48127', '48129', '48250'] as const

// 대장단지 구별 정의 (6개 sub-region)
export const CHAMPION_REGIONS = [
  { sggCode: '48121', label: '의창구' },
  { sggCode: '48123', label: '성산구' },
  { sggCode: '48125', label: '마산합포구' },
  { sggCode: '48127', label: '마산회원구' },
  { sggCode: '48129', label: '진해구' },
  { sggCode: '48250', label: '김해시' },
] as const

// ── 지역 랭킹 탭 정의 ───────────────────────────────────────────────────────
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
  price: number
  area_m2: number
  floor: number | null
  deal_date: string       // YYYY-MM-DD
  dong: string | null
  is_new_high: boolean
  prevPrice: number | null   // 직전 동일 면적 거래가
  priceDelta: number | null  // price - prevPrice (만원)
  complexId: string
  complexName: string
  urlSlug: string | null
}

export interface AllTimeHighRow {
  complexId: string
  complexName: string
  urlSlug: string | null
  si: string | null
  gu: string | null
  price: number
  area_m2: number
  deal_date: string
  floor: number | null
}

export interface RegionalHeatRow {
  sggCode: string
  label: string
  txCount30d: number
}

export interface DailyFeedGroup {
  date: string
  transactions: DailyFeedTransaction[]
  hasMore: boolean  // maxPerDate에 의해 잘렸을 때 true
}

export interface RegionalRankingRow {
  rank: number
  complexId: string
  complexName: string
  urlSlug: string | null
  si: string | null
  gu: string | null
  dong: string | null
  avgPricePerPyeong: number
  recentTradePrice: number | null
  txCount30d: number
}

export interface ChampionComplex {
  complexId: string
  complexName: string
  urlSlug: string | null
  si: string | null
  gu: string | null
  avgPricePerPyeong: number
  priceChange30d: number | null
  txCount90d: number
}

export interface RegionChampion {
  sggCode: string
  regionLabel: string
  data: ChampionComplex | null
}

export interface WeeklyHighlights {
  topPriceRecent: Array<{
    complexId: string
    complexName: string
    urlSlug: string | null
    si: string | null
    gu: string | null
    price: number
    area_m2: number
    deal_date: string
  }>
  topVolumeRecent: Array<{
    complexId: string
    complexName: string
    urlSlug: string | null
    si: string | null
    gu: string | null
    txCount90d: number
  }>
  priceSurgeRecent: Array<{
    complexId: string
    complexName: string
    urlSlug: string | null
    si: string | null
    gu: string | null
    changeRatio: number
  }>
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

function nDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0]!
}

// ── 1. 일별 실거래 피드 ───────────────────────────────────────────────────────
/**
 * 실제 거래 데이터가 있는 가장 최근 날짜 기준으로 최대 maxGroups개 날짜를 반환.
 * 국토부 신고 지연(~30일) 고려 — lookbackDays=60 으로 충분한 윈도우 확보.
 * 날짜 탭은 오늘부터 -7일이 아닌 DB에 데이터가 실제로 있는 날짜 기준.
 */
export async function getRecentDailyFeed(
  supabase: SupabaseClient<Database>,
  lookbackDays = 60,
  maxGroups = 7,
  maxPerDate = 20,  // 날짜당 최대 표시 건수 (초과 시 hasMore=true)
): Promise<DailyFeedGroup[]> {
  const since = nDaysAgo(lookbackDays)

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
    .limit(maxGroups * 50 + 100)

  if (error) {
    console.error('[getRecentDailyFeed] failed:', error.message)
    return []
  }

  const feedRows = (feedData ?? []) as Record<string, unknown>[]
  if (feedRows.length === 0) return []

  // ── is_new_high: ±5㎡ 역대 최고가 비교 ─────────────────────────────────────
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
    .select('id, complex_id, area_m2, price, deal_date')
    .in('complex_id', feedComplexIds)
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .limit(10000)

  const histByComplex = new Map<string, Array<{ id: string; area_m2: number; price: number; deal_date: string }>>()
  for (const h of (histData ?? []) as Record<string, unknown>[]) {
    const cid = h['complex_id'] as string
    if (!histByComplex.has(cid)) histByComplex.set(cid, [])
    histByComplex.get(cid)!.push({
      id:        String(h['id']),
      area_m2:   Number(h['area_m2']),
      price:     Number(h['price']),
      deal_date: h['deal_date'] as string,
    })
  }

  // ── 날짜별 그룹핑 (최대 maxGroups 날짜) ─────────────────────────────────────
  const grouped = new Map<string, DailyFeedTransaction[]>()

  for (const row of feedRows) {
    const c = Array.isArray(row['complexes'])
      ? (row['complexes'] as Record<string, unknown>[])[0]
      : row['complexes'] as Record<string, unknown>
    if (!c) continue

    const date    = row['deal_date'] as string
    const price   = Number(row['price'])
    const area_m2 = Number(row['area_m2'])
    const txId    = String(row['id'])
    const cid     = c['id'] as string

    // 이미 maxGroups 날짜를 넘으면 더 이상 추가 안 함
    if (!grouped.has(date) && grouped.size >= maxGroups) continue

    const history     = histByComplex.get(cid) ?? []
    const comparables = history.filter(h => h.id !== txId && Math.abs(h.area_m2 - area_m2) <= 5)
    const maxPrice    = comparables.length > 0 ? Math.max(...comparables.map(h => h.price)) : 0
    const is_new_high = comparables.length > 0 && price >= maxPrice

    // 직전 거래 (동일 면적 ±5㎡, 현재 거래 날짜보다 이전)
    const prevTrade = comparables
      .filter(h => h.deal_date < date)
      .sort((a, b) => b.deal_date.localeCompare(a.deal_date))[0]
    const prevPrice  = prevTrade?.price ?? null
    const priceDelta = prevPrice != null ? price - prevPrice : null

    if (!grouped.has(date)) grouped.set(date, [])
    const group = grouped.get(date)!
    if (group.length >= maxPerDate) continue

    group.push({
      id:          txId,
      price,
      area_m2,
      floor:       row['floor'] != null ? Number(row['floor']) : null,
      deal_date:   date,
      dong:        c['dong'] as string | null,
      is_new_high,
      prevPrice,
      priceDelta,
      complexId:   cid,
      complexName: c['canonical_name'] as string,
      urlSlug:     c['url_slug'] as string | null,
    })
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, transactions]) => ({
      date,
      transactions,
      hasMore: transactions.length >= maxPerDate,
    }))
}

// ── 2. 대장단지 (구별 6개) ────────────────────────────────────────────────────
/**
 * 구별 대장단지. avg_sale_per_pyeong 기준 각 구 1위.
 * 6개 sub-region: 의창구, 성산구, 마산합포구, 마산회원구, 진해구, 김해시
 */
export async function getChampionComplexes(
  supabase: SupabaseClient<Database>,
): Promise<RegionChampion[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('complexes')
    .select('id, canonical_name, url_slug, si, gu, sgg_code, avg_sale_per_pyeong, price_change_30d')
    .in('sgg_code', [...ACTIVE_SGG_CODES])
    .not('avg_sale_per_pyeong', 'is', null)
    .gt('avg_sale_per_pyeong', 0)
    .eq('status', 'active')

  if (error) {
    console.error('[getChampionComplexes] failed:', error.message)
    return CHAMPION_REGIONS.map(r => ({ sggCode: r.sggCode, regionLabel: r.label, data: null }))
  }

  const rows = (data ?? []) as Record<string, unknown>[]

  // 90일 거래 건수 (보조 정보)
  const complexIds     = rows.map(r => r['id'] as string)
  const ninetyDaysAgo  = nDaysAgo(90)

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

  return CHAMPION_REGIONS.map(region => {
    const best = rows
      .filter(r => r['sgg_code'] === region.sggCode)
      .map(r => {
        const id = r['id'] as string
        return {
          complexId:         id,
          complexName:       r['canonical_name'] as string,
          urlSlug:           r['url_slug'] as string | null,
          si:                r['si'] as string | null,
          gu:                r['gu'] as string | null,
          avgPricePerPyeong: Number(r['avg_sale_per_pyeong']),
          priceChange30d:    r['price_change_30d'] != null ? Number(r['price_change_30d']) : null,
          txCount90d:        countMap.get(id) ?? 0,
        }
      })
      .sort((a, b) => b.avgPricePerPyeong - a.avgPricePerPyeong)

    return {
      sggCode:     region.sggCode,
      regionLabel: region.label,
      data:        best[0] ?? null,
    }
  })
}

// ── 3. 지역 랭킹 ─────────────────────────────────────────────────────────────
/**
 * 특정 지역 평당가 TOP 20.
 * tx_count_30d 조건 제거 — 신고 지연으로 최근 거래 없는 단지도 포함.
 */
export async function getRegionalPriceRanking(
  supabase: SupabaseClient<Database>,
  sggCodes: string[],
): Promise<RegionalRankingRow[]> {
  if (sggCodes.length === 0) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: complexList, error: e1 } = await (supabase as any)
    .from('complexes')
    .select('id, canonical_name, url_slug, si, gu, dong, avg_sale_per_pyeong, tx_count_30d')
    .in('sgg_code', sggCodes)
    .not('avg_sale_per_pyeong', 'is', null)
    .eq('status', 'active')
    .order('avg_sale_per_pyeong', { ascending: false })
    .limit(5)

  if (e1) {
    console.error('[getRegionalPriceRanking] complexes query failed:', e1.message)
    return []
  }

  const rows = (complexList ?? []) as Record<string, unknown>[]
  if (rows.length === 0) return []

  const ids = rows.map(r => r['id'] as string)
  const ninetyDaysAgo = nDaysAgo(90)

  // 최근 거래가 (90일 이내 가장 최근 거래)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: txData } = await (supabase as any)
    .from('transactions')
    .select('complex_id, price, deal_date')
    .in('complex_id', ids)
    .gte('deal_date', ninetyDaysAgo)
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
    dong:              r['dong'] as string | null,
    avgPricePerPyeong: Number(r['avg_sale_per_pyeong']),
    recentTradePrice:  latestPriceMap.get(r['id'] as string) ?? null,
    txCount30d:        Number(r['tx_count_30d']),
  }))
}

// ── 4. 흥미 지표 ─────────────────────────────────────────────────────────────
/**
 * 최근 흥미 지표 (30일 최고가 / 90일 거래량 / 가격 변동 단지)
 * - topPriceRecent: 30일 최고가 거래 TOP 3 (기존 7일 → 30일로 확장)
 * - topVolumeRecent: 90일 직접 집계 (cached tx_count_30d 아닌 실거래 기반)
 * - priceSurgeRecent: price_change_30d ≥ 3% (기존 20% 기준 → 3%로 완화)
 */
export async function getWeeklyHighlights(
  supabase: SupabaseClient<Database>,
): Promise<WeeklyHighlights> {
  const thirtyDaysAgo  = nDaysAgo(30)
  const ninetyDaysAgo  = nDaysAgo(90)

  const [priceResult, volResult, surgeResult] = await Promise.all([
    // 최근 30일 최고가 거래 TOP 5
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('transactions')
      .select(`
        price, area_m2, deal_date,
        complexes!inner (id, canonical_name, url_slug, si, gu, sgg_code)
      `)
      .in('complexes.sgg_code', [...ACTIVE_SGG_CODES])
      .gte('deal_date', thirtyDaysAgo)
      .eq('deal_type', 'sale')
      .is('cancel_date', null)
      .is('superseded_by', null)
      .order('price', { ascending: false })
      .limit(5),

    // 최근 90일 거래 건수 직접 집계
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('transactions')
      .select(`
        complex_id,
        complexes!inner (id, canonical_name, url_slug, si, gu, sgg_code)
      `)
      .in('complexes.sgg_code', [...ACTIVE_SGG_CODES])
      .gte('deal_date', ninetyDaysAgo)
      .eq('deal_type', 'sale')
      .is('cancel_date', null)
      .is('superseded_by', null)
      .limit(2000),

    // 가격 변동 단지 (3% 이상)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('complexes')
      .select('id, canonical_name, url_slug, si, gu, price_change_30d')
      .in('sgg_code', [...ACTIVE_SGG_CODES])
      .not('price_change_30d', 'is', null)
      .gte('price_change_30d', 0.03)
      .eq('status', 'active')
      .order('price_change_30d', { ascending: false })
      .limit(5),
  ])

  // topPriceRecent
  const topPriceRecent: WeeklyHighlights['topPriceRecent'] = []
  for (const row of ((priceResult.data ?? []) as Record<string, unknown>[])) {
    const c = Array.isArray(row['complexes']) ? row['complexes'][0] : row['complexes']
    if (!c) continue
    topPriceRecent.push({
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

  // topVolumeRecent: 90일 직접 집계
  const volMap = new Map<string, { count: number; name: string; urlSlug: string | null; si: string | null; gu: string | null }>()
  for (const row of ((volResult.data ?? []) as Record<string, unknown>[])) {
    const c = Array.isArray(row['complexes']) ? row['complexes'][0] : row['complexes']
    if (!c) continue
    const cid = (c as Record<string, unknown>)['id'] as string
    if (!volMap.has(cid)) {
      volMap.set(cid, {
        count:   0,
        name:    (c as Record<string, unknown>)['canonical_name'] as string,
        urlSlug: (c as Record<string, unknown>)['url_slug'] as string | null,
        si:      (c as Record<string, unknown>)['si'] as string | null,
        gu:      (c as Record<string, unknown>)['gu'] as string | null,
      })
    }
    volMap.get(cid)!.count++
  }
  const topVolumeRecent: WeeklyHighlights['topVolumeRecent'] = [...volMap.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5)
    .map(([cid, v]) => ({ complexId: cid, complexName: v.name, urlSlug: v.urlSlug, si: v.si, gu: v.gu, txCount90d: v.count }))

  // priceSurgeRecent
  const priceSurgeRecent: WeeklyHighlights['priceSurgeRecent'] = (
    (surgeResult.data ?? []) as Record<string, unknown>[]
  ).map(r => ({
    complexId:   r['id'] as string,
    complexName: r['canonical_name'] as string,
    urlSlug:     r['url_slug'] as string | null,
    si:          r['si'] as string | null,
    gu:          r['gu'] as string | null,
    changeRatio: Number(r['price_change_30d']),
  }))

  return { topPriceRecent, topVolumeRecent, priceSurgeRecent }
}

// ── 5. 이번 달 신고가 경신 단지 수 ───────────────────────────────────────────
export async function getNewRecordCount(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from('complexes')
    .select('*', { count: 'exact', head: true })
    .in('sgg_code', [...ACTIVE_SGG_CODES])
    .eq('is_new_record_30d', true)
    .eq('status', 'active')

  return (count as number | null) ?? 0
}

// ── 6. 구별 30일 거래 온도 ───────────────────────────────────────────────────
/** 각 구의 30일 매매 거래 건수 (tx_count_30d 합산). 거래 활발도 비교 막대에 사용. */
export async function getRegionalTradingHeat(
  supabase: SupabaseClient<Database>,
): Promise<RegionalHeatRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('complexes')
    .select('sgg_code, tx_count_30d')
    .in('sgg_code', [...ACTIVE_SGG_CODES])
    .eq('status', 'active')
    .not('tx_count_30d', 'is', null)

  const sumMap = new Map<string, number>()
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const code = row['sgg_code'] as string
    sumMap.set(code, (sumMap.get(code) ?? 0) + Number(row['tx_count_30d']))
  }

  return CHAMPION_REGIONS
    .map(r => ({ sggCode: r.sggCode, label: r.label, txCount30d: sumMap.get(r.sggCode) ?? 0 }))
    .sort((a, b) => b.txCount30d - a.txCount30d)
}

// ── 7. 지역 역대 최고가 (단지별 1건) ─────────────────────────────────────────
/** 선택 지역의 단지별 역대 최고 거래가 TOP 5.
 *  complexes!inner join 필터 방식 대신 2-step 쿼리 사용 (PostgREST 호환성) */
export async function getRegionalAllTimeHighs(
  supabase: SupabaseClient<Database>,
  sggCodes: string[],
): Promise<AllTimeHighRow[]> {
  if (sggCodes.length === 0) return []

  // Step 1: 지역 내 active 단지 ID + 메타 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: complexData, error: e1 } = await (supabase as any)
    .from('complexes')
    .select('id, canonical_name, url_slug, si, gu')
    .in('sgg_code', sggCodes)
    .eq('status', 'active')

  if (e1 || !complexData?.length) return []

  type ComplexMeta = { canonical_name: string; url_slug: string | null; si: string | null; gu: string | null }
  const complexMap = new Map<string, ComplexMeta>()
  for (const c of complexData as Record<string, unknown>[]) {
    complexMap.set(c['id'] as string, {
      canonical_name: c['canonical_name'] as string,
      url_slug:       c['url_slug'] as string | null,
      si:             c['si'] as string | null,
      gu:             c['gu'] as string | null,
    })
  }

  // Step 2: 해당 단지들의 역대 최고가 거래 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: txData, error: e2 } = await (supabase as any)
    .from('transactions')
    .select('complex_id, price, area_m2, deal_date, floor')
    .in('complex_id', [...complexMap.keys()])
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .gt('area_m2', 0)
    .order('price', { ascending: false })
    .limit(200)

  if (e2) {
    console.error('[getRegionalAllTimeHighs] tx query failed:', e2.message)
    return []
  }

  // 단지별 최고가 1건만 추출
  const seen = new Set<string>()
  const result: AllTimeHighRow[] = []

  for (const row of (txData ?? []) as Record<string, unknown>[]) {
    const cid = row['complex_id'] as string
    if (seen.has(cid)) continue
    seen.add(cid)

    const c = complexMap.get(cid)
    if (!c) continue

    result.push({
      complexId:   cid,
      complexName: c.canonical_name,
      urlSlug:     c.url_slug,
      si:          c.si,
      gu:          c.gu,
      price:       Number(row['price']),
      area_m2:     Number(row['area_m2']),
      deal_date:   row['deal_date'] as string,
      floor:       row['floor'] != null ? Number(row['floor']) : null,
    })

    if (result.length >= 5) break
  }

  return result
}
