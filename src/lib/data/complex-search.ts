import type { SupabaseClient } from '@supabase/supabase-js'

export interface ComplexSearchResult {
  id:             string
  canonical_name: string
  road_address:   string | null
  si:             string | null
  gu:             string | null
  dong:           string | null
  sgg_code:       string
  lat:            number | null
  lng:            number | null
  similarity:     number
  url_slug:       string | null
  status:         string | null
}

export async function searchComplexes(
  query: string,
  sggCodes: string[],
  supabase: SupabaseClient,
  limit = 20,
): Promise<ComplexSearchResult[]> {
  // name_normalized는 공백·특수문자 제거 + 소문자 — 쿼리도 동일하게 정규화해야 매칭 정확도가 높아짐
  const q = query.trim().replace(/[\s\-\(\)\[\],\.·]/g, '').toLowerCase()
  if (!q || sggCodes.length === 0) return []

  const { data, error } = await supabase.rpc('search_complexes', {
    p_query:     q,
    p_sgg_codes: sggCodes,
    p_limit:     limit,
  })

  if (error) throw new Error(`searchComplexes failed: ${error.message}`)
  return (data ?? []) as ComplexSearchResult[]
}
