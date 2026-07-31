import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { SITE_ID } from '@/lib/data/site'

export async function hasPushSubscription(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
  return (data?.length ?? 0) > 0
}

export async function getFavoritesCount(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { count } = await supabase
    .from('favorites')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('site_id', SITE_ID)
  return count ?? 0
}

export async function getReviewsCount(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { count } = await supabase
    .from('complex_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  return count ?? 0
}
