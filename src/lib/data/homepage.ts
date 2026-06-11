import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface RecentHighRecord {
  price: number
  area_m2: number
  floor: number | null
  deal_date: string
  complex: {
    id: string
    canonical_name: string
    si: string | null
    gu: string | null
    dong: string | null
    url_slug: string | null
    status: string | null
  }
}

export interface ComplexRanking {
  id: string
  canonical_name: string
  si: string | null
  gu: string | null
  maxPrice: number
  rank: number
  url_slug: string | null
  status: string | null
}

export async function getRecentHighRecords(
  supabase: SupabaseClient<Database>,
  limit = 4,
): Promise<RecentHighRecord[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]!

  const { data } = await supabase
    .from('transactions')
    .select(
      `price, area_m2, floor, deal_date, deal_type,
       complexes!inner (id, canonical_name, si, gu, dong, url_slug, status)`,
    )
    .is('cancel_date', null)
    .is('superseded_by', null)
    .gte('deal_date', thirtyDaysAgo)
    .eq('deal_type', 'sale')
    .order('price', { ascending: false })
    .limit(limit)

  const records: RecentHighRecord[] = []
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const c = Array.isArray(r.complexes) ? r.complexes[0] : r.complexes
    if (!c || r.price == null) continue
    records.push({
      price: r.price as number,
      area_m2: r.area_m2 as number,
      floor: r.floor as number | null,
      deal_date: r.deal_date as string,
      complex: {
        id: c.id as string,
        canonical_name: c.canonical_name as string,
        si: c.si as string | null,
        gu: c.gu as string | null,
        dong: c.dong as string | null,
        url_slug: c.url_slug as string | null,
        status: c.status as string | null,
      },
    })
  }
  return records
}

export async function getTopComplexRankings(
  supabase: SupabaseClient<Database>,
  limit = 8,
): Promise<ComplexRanking[]> {
  const { data } = await supabase
    .from('transactions')
    .select(
      `complex_id, price,
       complexes!inner (id, canonical_name, si, gu, url_slug, status)`,
    )
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .order('price', { ascending: false })
    .limit(limit * 6)

  const seen = new Set<string>()
  const rankings: ComplexRanking[] = []

  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const complexId: string = r.complex_id
    if (seen.has(complexId)) continue
    seen.add(complexId)
    const c = Array.isArray(r.complexes) ? r.complexes[0] : r.complexes
    if (!c || r.price == null) continue
    rankings.push({
      id: complexId,
      canonical_name: c.canonical_name as string,
      si: c.si as string | null,
      gu: c.gu as string | null,
      maxPrice: r.price as number,
      rank: rankings.length + 1,
      url_slug: c.url_slug as string | null,
      status: c.status as string | null,
    })
    if (rankings.length >= limit) break
  }

  return rankings
}
