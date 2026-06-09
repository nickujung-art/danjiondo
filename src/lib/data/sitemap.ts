import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface SitemapEntry {
  id:         string
  updated_at: string
  url_slug:   string | null  // SEO-05: 한글 URL 사이트맵 포함
  si:         string | null  // 계층 URL 추출용
  gu:         string | null
  dong:       string | null
}

export async function getComplexesForSitemap(
  supabase: SupabaseClient<Database>,
): Promise<SitemapEntry[]> {
  const { data } = await supabase
    .from('complexes')
    .select('id, updated_at, url_slug, si, gu, dong')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(50000)
  return data ?? []
}
