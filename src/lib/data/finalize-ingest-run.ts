import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// ingest_runs 마감 기록 (2026-08-06)
//
// [왜 따로 뺐나]
// 적재 3경로(아파트, 연립다세대, 오피스텔)가 각자 같은 UPDATE를 복제해 갖고 있었고,
// 셋 다 **결과를 버렸다**.
//
//   await supabase.from('ingest_runs').update({ status, ... }).eq('id', runId)
//
// supabase-js는 실패에 예외를 던지지 않으므로 이 UPDATE가 실패하면 아무 흔적이 없다.
// 그러면 그 run은 영원히 'running'으로 남고, 무엇을 몇 건 넣었는지 기록이 사라진다.
// 하필 이게 **적재 결과를 남기는 쓰기 자체**라, 실패하면 "실패했다는 사실"이 지워진다.
//
// 2026-08-06 전수 점검에서 이 프로젝트가 반복해 겪은 장애가 전부 같은 모양이었다 —
// 실패가 예외가 아니라 정상 응답의 모습으로 끝난다. 그래서 마감 기록만큼은 실패 시
// 반드시 로그에 남긴다. 던지지는 않는다(적재는 이미 끝났고, 여기서 던지면 성공한
// 적재까지 실패로 보고된다).

export interface IngestRunFinalization {
  status: string
  rowsFetched: number
  rowsUpserted: number
  errorMessage: string | null
}

/**
 * 적재 run의 마감 상태를 기록한다. 실패해도 던지지 않고 false를 돌려준다 —
 * 호출부는 이미 적재를 끝낸 상태라 되돌릴 것이 없다. 대신 침묵하지는 않는다.
 */
export async function finalizeIngestRun(
  supabase: SupabaseClient<Database>,
  runId: string,
  result: IngestRunFinalization,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('ingest_runs') as any)
    .update({
      status: result.status,
      rows_fetched: result.rowsFetched,
      rows_upserted: result.rowsUpserted,
      error_message: result.errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId)

  if (error) {
    console.error(
      `[ingest] run ${runId} 마감 기록 실패 — 이 run은 'running'으로 남는다: ${error.message}`,
    )
    return false
  }
  return true
}
