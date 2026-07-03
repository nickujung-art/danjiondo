import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getActiveSggCodes } from './regions'

const WINDOW_DAYS = 30

export type RankType = 'high_price' | 'volume' | 'price_per_pyeong' | 'interest'

export interface RankingRow {
  id: string
  canonical_name: string
  si: string | null
  gu: string | null
  score: number
  rank: number
  area_m2?: number | null  // 신고가 탭: 해당 거래 면적
}

// ── 읽기 함수 (createReadonlyClient 또는 admin client 모두 사용 가능) ──────────

/**
 * complex_rankings 테이블에서 rank_type별 상위 N개 결과를 반환한다.
 * page.tsx에서 createReadonlyClient()로 호출 → ISR 가능.
 */
export async function getRankingsByType(
  supabase: SupabaseClient<Database>,
  rankType: RankType,
  limit = 10,
): Promise<RankingRow[]> {
  const { data, error } = await supabase
    .from('complex_rankings')
    .select(`
      score, rank, metadata,
      complexes!inner (id, canonical_name, si, gu)
    `)
    .eq('rank_type', rankType)
    .eq('window_days', WINDOW_DAYS)
    .order('rank', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`getRankingsByType(${rankType}) failed: ${error.message}`)

  const results: RankingRow[] = []
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const c = Array.isArray(r.complexes) ? r.complexes[0] : r.complexes
    if (!c) continue
    const meta = r.metadata as Record<string, unknown> | null
    results.push({
      id: c.id as string,
      canonical_name: c.canonical_name as string,
      si: c.si as string | null,
      gu: c.gu as string | null,
      score: Number(r.score),
      rank: Number(r.rank),
      area_m2: typeof meta?.area_m2 === 'number' ? meta.area_m2 : null,
    })
  }
  return results
}

// ── 집계 함수 (createSupabaseAdminClient()로만 호출) ──────────────────────────

interface AggRow {
  complex_id: string
  score: number
  metadata?: Record<string, unknown>
}

async function aggregateHighPrice(supabase: SupabaseClient<Database>, activeSggCodes: string[]): Promise<AggRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .split('T')[0]!

  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', thirtyDaysAgo)
    .in('sgg_code', activeSggCodes)
    .not('complex_id', 'is', null)
    .order('price', { ascending: false })
    .limit(2000)

  if (error) throw new Error(`aggregateHighPrice failed: ${error.message}`)

  // 단지별 최고가 + 해당 거래 면적 집계
  const map = new Map<string, { price: number; area_m2: number | null }>()
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const cid: string = r.complex_id
    const price: number = r.price
    const cur = map.get(cid)
    if (!cur || price > cur.price) map.set(cid, { price, area_m2: r.area_m2 ?? null })
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b.price - a.price)
    .slice(0, 100)
    .map(([complex_id, { price, area_m2 }]) => ({
      complex_id,
      score: price,
      metadata: area_m2 != null ? { area_m2 } : undefined,
    }))
}

async function aggregateVolume(supabase: SupabaseClient<Database>, activeSggCodes: string[]): Promise<AggRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .split('T')[0]!

  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', thirtyDaysAgo)
    .in('sgg_code', activeSggCodes)
    .not('complex_id', 'is', null)
    .limit(5000)

  if (error) throw new Error(`aggregateVolume failed: ${error.message}`)

  const map = new Map<string, number>()
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const cid: string = r.complex_id
    map.set(cid, (map.get(cid) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 100)
    .map(([complex_id, score]) => ({ complex_id, score }))
}

async function aggregatePricePerPyeong(supabase: SupabaseClient<Database>, activeSggCodes: string[]): Promise<AggRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .split('T')[0]!

  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', thirtyDaysAgo)
    .in('sgg_code', activeSggCodes)
    .not('complex_id', 'is', null)
    .gt('area_m2', 0)
    .limit(5000)

  if (error) throw new Error(`aggregatePricePerPyeong failed: ${error.message}`)

  const map = new Map<string, { sum: number; count: number }>()
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const cid: string = r.complex_id
    const pricePerPyeong = (r.price as number) / ((r.area_m2 as number) / 3.3058)
    const cur = map.get(cid) ?? { sum: 0, count: 0 }
    map.set(cid, { sum: cur.sum + pricePerPyeong, count: cur.count + 1 })
  }
  return Array.from(map.entries())
    .map(([complex_id, { sum, count }]) => ({
      complex_id,
      score: Math.round(sum / count),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)
}

async function aggregateInterest(supabase: SupabaseClient<Database>, activeSggCodes: string[]): Promise<AggRow[]> {
  // favorites JOIN complexes → sgg_code 필터 (favorites 테이블에 sgg_code 없음)
  const { data, error } = await supabase
    .from('favorites')
    .select(`
      complex_id,
      complexes!inner (sgg_code)
    `)
    .in('complexes.sgg_code', activeSggCodes)
    .limit(5000)

  if (error) throw new Error(`aggregateInterest failed: ${error.message}`)

  const map = new Map<string, number>()
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const cid: string = r.complex_id
    map.set(cid, (map.get(cid) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 100)
    .map(([complex_id, score]) => ({ complex_id, score }))
}

/**
 * 4종 랭킹을 집계해 complex_rankings 테이블에 UPSERT한다.
 * cron endpoint에서 createSupabaseAdminClient()를 전달받아 호출한다.
 */
export async function computeRankings(
  supabase: SupabaseClient<Database>,
): Promise<{ type: RankType; upserted: number }[]> {
  const computedAt = new Date().toISOString()
  const activeSggCodes = await getActiveSggCodes(supabase)

  const aggregators: Array<{
    type: RankType
    fn: (s: SupabaseClient<Database>, codes: string[]) => Promise<AggRow[]>
  }> = [
    { type: 'high_price', fn: aggregateHighPrice },
    { type: 'volume', fn: aggregateVolume },
    { type: 'price_per_pyeong', fn: aggregatePricePerPyeong },
    { type: 'interest', fn: aggregateInterest },
  ]

  const results: { type: RankType; upserted: number }[] = []

  for (const { type, fn } of aggregators) {
    const rows = await fn(supabase, activeSggCodes)

    if (rows.length === 0) {
      results.push({ type, upserted: 0 })
      continue
    }

    const upsertRows = rows.map((row, idx) => ({
      complex_id: row.complex_id,
      rank_type: type,
      score: row.score,
      rank: idx + 1,
      window_days: WINDOW_DAYS,
      computed_at: computedAt,
      metadata: row.metadata ?? null,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('complex_rankings')
      .upsert(upsertRows, {
        onConflict: 'rank_type,complex_id,window_days',
        ignoreDuplicates: false,
      })

    if (error) throw new Error(`computeRankings UPSERT(${type}) failed: ${error.message}`)
    results.push({ type, upserted: upsertRows.length })
  }

  return results
}
