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

  // 후보를 넉넉히 가져와 역대 최고가 검증 후 top N 선택
  const { data } = await supabase
    .from('transactions')
    .select(
      `id, complex_id, price, area_m2, floor, deal_date,
       complexes!inner (id, canonical_name, si, gu, dong, url_slug, status)`,
    )
    .is('cancel_date', null)
    .is('superseded_by', null)
    .gte('deal_date', thirtyDaysAgo)
    .eq('deal_type', 'sale')
    .order('price', { ascending: false })
    .limit(limit * 10)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  if (!rows.length) return []

  const complexIds = [...new Set(rows.map((r: { complex_id: string }) => r.complex_id))]

  // 각 단지 역대 거래 (±5㎡ 최고가 비교용)
  const { data: histData } = await supabase
    .from('transactions')
    .select('id, complex_id, area_m2, price')
    .in('complex_id', complexIds)
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .limit(5000)

  const histByComplex = new Map<string, Array<{ id: string; area_m2: number; price: number }>>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const h of (histData ?? []) as any[]) {
    const cid = h.complex_id as string
    if (!histByComplex.has(cid)) histByComplex.set(cid, [])
    histByComplex.get(cid)!.push({ id: String(h.id), area_m2: Number(h.area_m2), price: Number(h.price) })
  }

  const records: RecentHighRecord[] = []
  const seen = new Set<string>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of rows as any[]) {
    const c = Array.isArray(row.complexes) ? row.complexes[0] : row.complexes
    if (!c || row.price == null) continue

    const cid = row.complex_id as string
    const txId = String(row.id)
    const price = Number(row.price)
    const area_m2 = Number(row.area_m2)

    if (seen.has(cid)) continue

    // 역대 최고가 갱신 여부: ±5㎡ 비교 거래보다 높아야 함
    const history = histByComplex.get(cid) ?? []
    const comparables = history.filter(h => h.id !== txId && Math.abs(h.area_m2 - area_m2) <= 5)
    if (comparables.length > 0 && price <= Math.max(...comparables.map(h => h.price))) continue

    seen.add(cid)
    records.push({
      price,
      area_m2,
      floor: row.floor as number | null,
      deal_date: row.deal_date as string,
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
    if (records.length >= limit) break
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
