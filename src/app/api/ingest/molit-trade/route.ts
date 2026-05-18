import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { ingestMonth } from '@/lib/data/realprice'
import type { IngestResult } from '@/lib/data/realprice'

export const maxDuration = 60

function prevYearMonth(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function GET(request: Request): Promise<Response> {
  // CRON_SECRET 검증 (ADR: 모든 /api/ingest/* 필수)
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createSupabaseAdminClient()

  // 30분 이상 stuck된 running 행 정리 (타임아웃으로 종료된 이전 실행)
  await supabase
    .from('ingest_runs')
    .update({ status: 'failed', error_message: 'timeout: cleaned up by next run' })
    .eq('status', 'running')
    .lt('started_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())

  // 활성 지역 목록 조회
  const { data: regions, error: regErr } = await supabase
    .from('regions')
    .select('sgg_code')
    .eq('is_active', true)
    .order('sgg_code')
  if (regErr) {
    return Response.json({ error: regErr.message }, { status: 500 })
  }

  const months = [prevYearMonth(), currentYearMonth()]
  const results: Record<string, IngestResult> = {}

  for (const yearMonth of months) {
    for (const { sgg_code } of (regions ?? []) as { sgg_code: string }[]) {
      const key = `${yearMonth}/${sgg_code}`
      try {
        results[key] = await ingestMonth(sgg_code, yearMonth, supabase)
      } catch (err) {
        results[key] = {
          runId:        '',
          sggCode:      sgg_code,
          yearMonth,
          rowsFetched:  0,
          rowsUpserted: 0,
          rowsSkipped:  0,
          rowsFailed:   0,
          status:       'failed',
        }
        console.error(`ingestMonth failed for ${sgg_code} ${yearMonth}:`, err)
      }
    }
  }

  const total = Object.values(results)
  const summary = {
    months,
    regions:      (regions ?? []).length,
    rowsUpserted: total.reduce((s, r) => s + r.rowsUpserted, 0),
    failed:       total.filter(r => r.status === 'failed').length,
  }

  // ── Phase 3 LEGAL-04: 30일 경과 탈퇴 계정 hard delete (D-07) ──
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: expiredProfiles, error: expErr } = await supabase
    .from('profiles')
    .select('id')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', thirtyDaysAgo)

  let hardDeleted = 0
  let hardDeleteFailed = 0

  if (expErr) {
    console.error('[hard-delete] expiredProfiles query failed:', expErr.message)
  } else {
    for (const { id } of (expiredProfiles ?? []) as { id: string }[]) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(id)
      if (delErr) {
        hardDeleteFailed += 1
        console.error(`[hard-delete] auth.admin.deleteUser failed for ${id}:`, delErr.message)
        continue
      }
      // auth.users ON DELETE CASCADE → profiles 자동 삭제
      hardDeleted += 1
    }
  }

  return Response.json({
    summary: { ...summary, hardDeleted, hardDeleteFailed },
    results,
  })
}
