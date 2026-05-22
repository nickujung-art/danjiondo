import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CafeArticleItem } from '@/services/naver-cafe'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export interface CafeArticleRecord {
  id:               string
  complex_id:       string
  naver_article_id: string
  title:            string
  description:      string | null
  cafe_name:        string | null
  article_url:      string
  published_at:     string | null
  fetched_at:       string
}

export async function getCafeArticlesByComplex(
  complexId: string,
  supabase: AnySupabase,
  limit = 5,
): Promise<CafeArticleRecord[]> {
  const { data } = await supabase
    .from('cafe_articles')
    .select('id, complex_id, naver_article_id, title, description, cafe_name, article_url, published_at, fetched_at')
    .eq('complex_id', complexId)
    .order('published_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as CafeArticleRecord[]
}

export async function ingestCafeArticles(
  complexId: string,
  articles: CafeArticleItem[],
  supabase: AnySupabase,
): Promise<number> {
  if (articles.length === 0) return 0

  const rows = articles.map(a => ({
    complex_id:       complexId,
    naver_article_id: a.articleId,
    title:            a.title.slice(0, 200),
    description:      a.description.slice(0, 500),
    cafe_name:        a.cafeName,
    article_url:      a.articleUrl,
    published_at:     a.publishedAt,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, data } = await (supabase as any)
    .from('cafe_articles')
    .upsert(rows, { onConflict: 'naver_article_id', ignoreDuplicates: true })
    .select('id')

  if (error) throw new Error(`cafe_articles upsert: ${(error as { message: string }).message}`)
  return (data as unknown[] | null)?.length ?? 0
}
