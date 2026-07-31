import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { SITE_ID } from '@/lib/data/site'

export interface FavoriteItem {
  id: string
  complex_id: string
  alert_enabled: boolean
  price_alert_threshold: number | null
  created_at: string
  complex: {
    id: string
    canonical_name: string
    si: string | null
    gu: string | null
    dong: string | null
  }
}

export async function getFavorites(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<FavoriteItem[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select(
      `id, complex_id, alert_enabled, price_alert_threshold, created_at,
       complexes!inner (id, canonical_name, si, gu, dong)`,
    )
    .eq('user_id', userId)
    .eq('site_id', SITE_ID)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`getFavorites failed: ${error.message}`)

  return (data ?? []).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const c = Array.isArray(r.complexes) ? r.complexes[0] : r.complexes
    return {
      id:                    r.id as string,
      complex_id:            r.complex_id as string,
      alert_enabled:         r.alert_enabled as boolean,
      price_alert_threshold: r.price_alert_threshold as number | null,
      created_at:            r.created_at as string,
      complex: {
        id:             c.id as string,
        canonical_name: c.canonical_name as string,
        si:             c.si as string | null,
        gu:             c.gu as string | null,
        dong:           c.dong as string | null,
      },
    }
  })
}

export async function isFavorited(
  userId: string,
  complexId: string,
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('complex_id', complexId)
    .eq('site_id', SITE_ID)
    .maybeSingle()

  return data !== null
}
