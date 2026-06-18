import { verifyCronSecret } from '@/lib/cron-auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { computeRankings } from '@/lib/data/rankings'
import { markCronSuccess, markCronFailed } from '@/lib/data/cron-status'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  // CRON_SECRET 검증 (ADR: 모든 /api/cron/* 필수)
  if (!verifyCronSecret(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createSupabaseAdminClient()

  // ingest_runs 실행 시작 기록 (data_sources에 'rankings' row 없으면 skip)
  const startedAt = new Date().toISOString()
  let runId: string | null = null

  try {
    const { data: runData } = await supabase
      .from('ingest_runs')
      .insert({
        source_id: 'rankings',
        status: 'running',
        started_at: startedAt,
      })
      .select('id')
      .single()

    runId = (runData as { id: string } | null)?.id ?? null
  } catch {
    // data_sources에 'rankings' source_id가 없으면 FK 오류 — ingest_runs 기록 없이 계속 진행
  }

  try {
    const results = await computeRankings(supabase)
    const totalUpserted = results.reduce((s, r) => s + r.upserted, 0)

    // ingest_runs 완료 기록
    if (runId) {
      await supabase
        .from('ingest_runs')
        .update({
          status: 'success',
          completed_at: new Date().toISOString(),
          rows_upserted: totalUpserted,
        })
        .eq('id', runId)
    }

    await markCronSuccess(supabase, 'rankings')

    return Response.json({
      ok: true,
      results,
      totalUpserted,
      runId,
      computedAt: new Date().toISOString(),
    })
  } catch (err) {
    // ingest_runs 실패 기록
    if (runId) {
      await supabase
        .from('ingest_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq('id', runId)
    }

    await markCronFailed(supabase, 'rankings')

    console.error('computeRankings failed:', err)
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
