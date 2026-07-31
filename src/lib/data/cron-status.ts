import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>
type DataSourceStatus = 'success' | 'partial' | 'failed'
type DataSourceUpdate = Database['public']['Tables']['data_sources']['Update']

/**
 * `data_sources` 한 행을 갱신하고 실제로 반영됐는지 확인한다.
 *
 * 이전 구현은 `.update()`의 error를 확인하지 않았다. Supabase에서 조건에 맞는 행이
 * 없으면 **에러가 아니라 0행 갱신으로 조용히 성공**하므로, 크론 상태가 한 번도
 * 기록되지 않아도 아무도 알 수 없었다(`data_sources.kapt`가 실제로 그 상태였다).
 *
 * throw하지 않고 boolean을 돌려주는 이유: 이 함수는 크론의 "보고" 단계다.
 * 보고 실패가 크론 본체를 죽여서는 안 되고, 현재 `.catch()` 없이 호출하는
 * 라우트들(rankings·cafe-ingest·notify)이 갑자기 500을 내서도 안 된다.
 * 호출부는 반환값을 확인해 상위 에러 목록에 넣을 수 있다.
 */
async function applyStatusUpdate(
  supabase: Client,
  sourceId: string,
  patch: DataSourceUpdate,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('data_sources')
    .update(patch)
    .eq('id', sourceId)
    .select('id')

  if (error) {
    console.error(`[cron-status] '${sourceId}' 갱신 실패: ${error.message}`)
    return false
  }
  if (!data || data.length === 0) {
    console.error(`[cron-status] '${sourceId}' 갱신 0행 — data_sources에 해당 id가 없다`)
    return false
  }
  return true
}

export async function markCronSuccess(supabase: Client, sourceId: string): Promise<boolean> {
  return applyStatusUpdate(supabase, sourceId, {
    last_synced_at: new Date().toISOString(),
    last_status: 'success',
    consecutive_failures: 0,
  })
}

export async function markCronFailed(
  supabase: Client,
  sourceId: string,
  errorMessage?: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('data_sources')
    .select('consecutive_failures')
    .eq('id', sourceId)
    .maybeSingle()
  const prev = (data as { consecutive_failures: number } | null)?.consecutive_failures ?? 0
  return applyStatusUpdate(supabase, sourceId, {
    last_synced_at: new Date().toISOString(),
    last_status: 'failed',
    consecutive_failures: prev + 1,
    ...(errorMessage !== undefined ? { error_message: errorMessage } : {}),
  })
}

export async function markCronPartial(
  supabase: Client,
  sourceId: string,
  errorMessage?: string,
): Promise<boolean> {
  return applyStatusUpdate(supabase, sourceId, {
    last_synced_at: new Date().toISOString(),
    last_status: 'partial',
    ...(errorMessage !== undefined ? { error_message: errorMessage } : {}),
  })
}

export async function markCronStatus(
  supabase: Client,
  sourceId: string,
  status: DataSourceStatus,
  errorMessage?: string,
): Promise<boolean> {
  if (status === 'success') return markCronSuccess(supabase, sourceId)
  if (status === 'failed')  return markCronFailed(supabase, sourceId, errorMessage)
  return markCronPartial(supabase, sourceId, errorMessage)
}
