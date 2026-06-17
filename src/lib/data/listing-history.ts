// src/lib/data/listing-history.ts
// CLAUDE.md: Supabase 쿼리 → 서버 컴포넌트·API Route 전용
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface ListingPricePoint {
  recorded_date: string   // 'YYYY-MM-DD'
  price_per_py:  number   // 만원/평
}

/**
 * 호가 히스토리 조회 (source='naver' 전용, 최근 N개월)
 *
 * RESEARCH.md §5.2: .eq('source', 'naver') 필터
 * CLAUDE.md: 거래 조회는 서버 컴포넌트에서만
 */
export async function getListingPriceHistory(
  complexId: string,
  supabase:  SupabaseClient<Database>,
  months = 12,
): Promise<ListingPricePoint[]> {
  const cutoff = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const { data } = await supabase
    .from('listing_prices')
    .select('recorded_date, price_per_py')
    .eq('complex_id', complexId)
    .eq('source', 'naver')
    .gte('recorded_date', cutoff)
    .order('recorded_date', { ascending: true })

  return (data ?? []).map(r => ({
    recorded_date: r.recorded_date as string,
    price_per_py:  r.price_per_py as number,
  }))
}
