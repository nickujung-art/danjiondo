import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createReadonlyClient } from '@/lib/supabase/readonly'

export interface ComplexDetail {
  id:              string
  canonical_name:  string
  road_address:    string | null
  si:              string | null
  gu:              string | null
  dong:            string | null
  built_year:      number | null
  household_count: number | null
  floors_above:    number | null
  heat_type:       string | null
  sgg_code:        string
  status:          string
  lat:             number | null
  lng:             number | null
  url_slug:        string | null  // SEO-01: 한글 URL 경로 (예: '창원시/성산구/내동/대우2차')
}

export interface MonthlyPriceSummary {
  yearMonth: string   // "YYYY-MM"
  avgPrice:  number   // 만원
  count:     number
  avgArea:   number
}

// 요청 단위 캐시 — generateMetadata + page 함수에서 중복 호출 방지
export const getComplexByIdCached = cache(async (id: string): Promise<ComplexDetail | null> => {
  const supabase = createReadonlyClient()
  return getComplexById(id, supabase)
})

export async function getComplexById(
  id: string,
  supabase: SupabaseClient,
): Promise<ComplexDetail | null> {
  const { data, error } = await supabase
    .from('complexes')
    .select(`
      id, canonical_name, road_address,
      si, gu, dong,
      built_year, household_count, floors_above, heat_type,
      sgg_code, status, lat, lng, url_slug
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`getComplexById failed: ${error.message}`)
  return data as ComplexDetail | null
}

export async function getComplexTransactionSummary(
  complexId: string,
  dealType: 'sale' | 'jeonse' | 'monthly',
  supabase: SupabaseClient,
  months = 120,
): Promise<MonthlyPriceSummary[]> {
  const { data, error } = await supabase.rpc('complex_monthly_prices', {
    p_complex_id: complexId,
    p_deal_type:  dealType,
    p_months:     months,
  })

  if (error) throw new Error(`getComplexTransactionSummary failed: ${error.message}`)
  if (!data) return []

  return (data as { year_month: string; avg_price: number; count: number; avg_area: number }[]).map(
    (row) => ({
      yearMonth: row.year_month,
      avgPrice:  Number(row.avg_price),
      count:     Number(row.count),
      avgArea:   Number(row.avg_area),
    }),
  )
}

export interface RawTransaction {
  dealDate:  string  // "YYYY-MM-DD"
  yearMonth: string  // "YYYY-MM"
  price:     number  // 만원
  area:      number  // m2 (numeric → number)
}

/**
 * UX-01/UX-02 — 개별 거래 행 fetch (IQR 계산 + 평형 그룹화 + 기간 slice 원천)
 * complex_transactions_for_chart RPC 호출 — Phase 9 Wave 0 신규
 */
export async function getComplexRawTransactions(
  complexId: string,
  dealType: 'sale' | 'jeonse',
  supabase: SupabaseClient,
  months = 120,
): Promise<RawTransaction[]> {
  const { data, error } = await supabase.rpc('complex_transactions_for_chart', {
    p_complex_id: complexId,
    p_deal_type:  dealType,
    p_months:     months,
    p_area_m2:    null,  // 전체 평형 fetch — 클라이언트에서 slice
  })
  if (error) throw new Error(`getComplexRawTransactions failed: ${error.message}`)
  if (!data) return []
  return (data as Array<{ deal_date: string; year_month: string; price: number | string; area_m2: number | string }>).map(
    (row) => ({
      dealDate:  row.deal_date,
      yearMonth: row.year_month,
      price:     Number(row.price),
      area:      Number(row.area_m2),
    }),
  )
}
