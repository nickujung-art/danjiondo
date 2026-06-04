import type { SupabaseClient } from '@supabase/supabase-js'

export interface NearbyComplex {
  complexId:      string
  complexName:    string
  distanceM:      number
  avgPricePerPy:  number   // 만원/평
  txCount:        number
  builtYear:      number | null
}

export async function getNearbyComplexPrices(
  supabase:  SupabaseClient,
  complexId: string,
  radiusM = 2000,
  months  = 6,
  limit   = 4,
): Promise<NearbyComplex[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('nearby_complex_price_compare', {
    p_complex_id: complexId,
    p_radius_m:   radiusM,
    p_months:     months,
    p_limit:      limit,
  })
  if (error || !data) return []
  return (data as Array<{
    complex_id:       string
    complex_name:     string
    distance_m:       number
    avg_price_per_py: number
    tx_count:         number
    built_year:       number | null
  }>).map(r => ({
    complexId:     r.complex_id,
    complexName:   r.complex_name,
    distanceM:     Number(r.distance_m),
    avgPricePerPy: Number(r.avg_price_per_py),
    txCount:       Number(r.tx_count),
    builtYear:     r.built_year,
  }))
}
