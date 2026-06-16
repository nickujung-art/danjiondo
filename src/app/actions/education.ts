'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface SchoolRankingItem {
  rank:         number
  school_name:  string
  metric_value: number
  gu:           string | null
}

export async function fetchSchoolRanking(
  si:         string,
  schoolType: 'elementary' | 'middle' | 'high',
  metric:     string,
): Promise<SchoolRankingItem[]> {
  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('school_ranking', {
    p_si:          si,
    p_school_type: schoolType,
    p_metric:      metric,
  })
  if (error) {
    console.error('[fetchSchoolRanking]', error)
    return []
  }
  return (data ?? []) as SchoolRankingItem[]
}
