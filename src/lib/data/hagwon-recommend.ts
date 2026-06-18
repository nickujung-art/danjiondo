// CLAUDE.md: Supabase 쿼리 → 서버 컴포넌트·API Route·Server Action 전용
import type { SupabaseClient } from '@supabase/supabase-js'
import type { HagwonResult, RecommendInput, ChildProfile } from '@/services/neis-hagwon'

export async function fetchHagwonRecommendations(
  supabase: SupabaseClient,
  input: RecommendInput,
): Promise<HagwonResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('recommend_hagwons', {
    p_lat:       input.lat,
    p_lng:       input.lng,
    p_age_group: input.ageGroup ?? null,
    p_subjects:  input.subjects ?? null,
    p_fee_tiers: input.feeTierPref && input.feeTierPref.length > 0 ? input.feeTierPref : null,
    p_limit:     10,
  })
  if (error) {
    console.error('[fetchHagwonRecommendations]', error)
    return []
  }
  return (data ?? []) as HagwonResult[]
}

export async function fetchChildProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<ChildProfile | null> {
  const { data, error } = await supabase
    .from('user_child_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[fetchChildProfile]', error)
    return null
  }
  return data as ChildProfile | null
}
