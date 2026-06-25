import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  setWorkflowEnabled,
  getWorkflowState,
  getLatestWorkflowRun,
  triggerWorkflow,
} from '@/services/github-actions'

export const runtime = 'nodejs'

const GH_OWNER = 'nickujung-art'
const GH_REPO = 'bds'
const WEEKLY_WORKFLOW_ID = 'weekly-generate.yml'

// 다음 예정 실행 계산 (매주 월요일 00:10 KST = 일요일 15:10 UTC)
function nextScheduledRun(): string {
  const now = new Date()
  const utcSunday = new Date(now)
  // 다음 일요일(UTC) 15:10 찾기
  const day = now.getUTCDay() // 0=Sun
  const daysUntilSunday = day === 0 ? 7 : 7 - day
  utcSunday.setUTCDate(now.getUTCDate() + daysUntilSunday)
  utcSunday.setUTCHours(15, 10, 0, 0)
  return utcSunday.toISOString()
}

async function getAdminGuard() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 } as const
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes((profile as { role: string } | null)?.role ?? '')) {
    return { error: 'Forbidden', status: 403 } as const
  }
  return null
}

// GET: 스케줄러 상태 + 최근 실행 정보 (D-07)
export async function GET(): Promise<NextResponse> {
  const authErr = await getAdminGuard()
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status })

  try {
    const [state, latestRun] = await Promise.all([
      getWorkflowState(GH_OWNER, GH_REPO, WEEKLY_WORKFLOW_ID),
      getLatestWorkflowRun(GH_OWNER, GH_REPO, WEEKLY_WORKFLOW_ID),
    ])
    return NextResponse.json({
      enabled: state === 'active',
      state,
      latestRun,
      nextScheduledRun: nextScheduledRun(),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'GitHub API error' }, { status: 500 })
  }
}

// PUT: enable/disable (D-07)
export async function PUT(request: Request): Promise<NextResponse> {
  const authErr = await getAdminGuard()
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  const { enabled } = body as { enabled?: boolean }
  if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 })

  try {
    await setWorkflowEnabled(GH_OWNER, GH_REPO, WEEKLY_WORKFLOW_ID, enabled)
    return NextResponse.json({ ok: true, enabled })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'GitHub API error' }, { status: 502 })
  }
}

// POST: 수동 트리거 (D-07)
export async function POST(request: Request): Promise<NextResponse> {
  const authErr = await getAdminGuard()
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status })

  let body: unknown
  try { body = await request.json() } catch { body = {} }
  const { dry_run = false, series = '' } = (body as { dry_run?: boolean; series?: string }) ?? {}

  try {
    await triggerWorkflow({
      owner: GH_OWNER,
      repo: GH_REPO,
      workflowId: WEEKLY_WORKFLOW_ID,
      ref: 'main',
      inputs: {
        dry_run: String(dry_run),
        series: series,
      },
    })
    const run_url = `https://github.com/${GH_OWNER}/${GH_REPO}/actions/workflows/${WEEKLY_WORKFLOW_ID}`
    return NextResponse.json({ ok: true, run_url })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'trigger failed' }, { status: 502 })
  }
}
