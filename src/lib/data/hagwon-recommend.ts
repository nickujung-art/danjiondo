// CLAUDE.md: Supabase 쿼리 → 서버 컴포넌트·API Route·Server Action 전용
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChildProfile } from '@/services/neis-hagwon'
import type { RawCandidate } from '@/lib/hagwon-route'

interface CandidateInput {
  homeLat:    number
  homeLng:    number
  schoolLat?: number
  schoolLng?: number
  ageGroup?:  string
  subject?:   string
  limit?:     number
}

export async function fetchHagwonCandidates(
  supabase: SupabaseClient,
  input:    CandidateInput,
): Promise<RawCandidate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('recommend_hagwon_candidates', {
    p_home_lat:   input.homeLat,
    p_home_lng:   input.homeLng,
    p_school_lat: input.schoolLat ?? null,
    p_school_lng: input.schoolLng ?? null,
    p_age_group:  input.ageGroup  ?? null,
    p_subject:    input.subject   ?? null,
    p_limit:      input.limit     ?? 20,
  })
  if (error) {
    console.error('[fetchHagwonCandidates]', error)
    return []
  }
  return (data ?? []) as RawCandidate[]
}

export async function fetchChildProfile(
  supabase: SupabaseClient,
  userId:   string,
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
