import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type ComplexReview = Database['public']['Tables']['complex_reviews']['Row']

export interface ReviewStats {
  count: number
  avg_rating: number | null
}

export async function getComplexReviews(
  complexId: string,
  supabase: SupabaseClient<Database>,
  limit = 20,
): Promise<ComplexReview[]> {
  const { data } = await supabase
    .from('complex_reviews')
    .select('*')
    .eq('complex_id', complexId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getComplexReviewStats(
  complexId: string,
  supabase: SupabaseClient<Database>,
): Promise<ReviewStats> {
  // count: 'exact' + head: true로 카운트만 가져오기
  const { count } = await supabase
    .from('complex_reviews')
    .select('*', { count: 'exact', head: true })
    .eq('complex_id', complexId)

  if (!count) return { count: 0, avg_rating: null }

  // avg는 limit 없이 전체를 fetch하는 대신 DB 집계 RPC 활용
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aggData } = await (supabase as any).rpc('get_complex_review_avg', { p_complex_id: complexId })
  const avg = aggData != null ? Number(aggData) : null

  return { count, avg_rating: avg }
}
