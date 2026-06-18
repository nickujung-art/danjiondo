import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>
type DataSourceStatus = 'success' | 'partial' | 'failed'

export async function markCronSuccess(supabase: Client, sourceId: string): Promise<void> {
  await supabase.from('data_sources').update({
    last_synced_at: new Date().toISOString(),
    last_status: 'success',
    consecutive_failures: 0,
  }).eq('id', sourceId)
}

export async function markCronFailed(supabase: Client, sourceId: string, errorMessage?: string): Promise<void> {
  const { data } = await supabase
    .from('data_sources')
    .select('consecutive_failures')
    .eq('id', sourceId)
    .maybeSingle()
  const prev = (data as { consecutive_failures: number } | null)?.consecutive_failures ?? 0
  await supabase.from('data_sources').update({
    last_synced_at: new Date().toISOString(),
    last_status: 'failed',
    consecutive_failures: prev + 1,
    ...(errorMessage !== undefined ? { error_message: errorMessage } : {}),
  }).eq('id', sourceId)
}

export async function markCronPartial(supabase: Client, sourceId: string, errorMessage?: string): Promise<void> {
  await supabase.from('data_sources').update({
    last_synced_at: new Date().toISOString(),
    last_status: 'partial',
    ...(errorMessage !== undefined ? { error_message: errorMessage } : {}),
  }).eq('id', sourceId)
}

export async function markCronStatus(
  supabase: Client,
  sourceId: string,
  status: DataSourceStatus,
  errorMessage?: string,
): Promise<void> {
  if (status === 'success') return markCronSuccess(supabase, sourceId)
  if (status === 'failed')  return markCronFailed(supabase, sourceId, errorMessage)
  return markCronPartial(supabase, sourceId, errorMessage)
}
