import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type Realtor = Database['public']['Tables']['realtors']['Row']
export type RealtorAssignment = Database['public']['Tables']['realtor_assignments']['Row']

export async function getRealtorsByComplexId(
  complexId: string,
  supabase: SupabaseClient<Database>,
): Promise<Realtor[]> {
  const { data } = await supabase
    .from('realtor_assignments')
    .select('display_order, realtors(*)')
    .eq('complex_id', complexId)
    .order('display_order', { ascending: true })

  return (data ?? [])
    .map(row => (row as unknown as { display_order: number; realtors: Realtor | null }).realtors)
    .filter((r): r is Realtor => r !== null && r.is_active)
}

export async function getAllRealtors(
  supabase: SupabaseClient<Database>,
): Promise<Realtor[]> {
  const { data } = await supabase
    .from('realtors')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getRealtorById(
  id: string,
  supabase: SupabaseClient<Database>,
): Promise<Realtor | null> {
  const { data } = await supabase
    .from('realtors')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data ?? null
}

export async function getAssignmentsByRealtor(
  realtorId: string,
  supabase: SupabaseClient<Database>,
): Promise<(RealtorAssignment & { complexes: { id: string; canonical_name: string } | null })[]> {
  const { data } = await supabase
    .from('realtor_assignments')
    .select('*, complexes(id, canonical_name)')
    .eq('realtor_id', realtorId)
    .order('created_at', { ascending: true })
  return (data ?? []) as (RealtorAssignment & { complexes: { id: string; canonical_name: string } | null })[]
}
