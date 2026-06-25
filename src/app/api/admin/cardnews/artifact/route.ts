import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRunArtifacts, getArtifactDownloadUrl, getLatestWorkflowRun } from '@/services/github-actions'

export const runtime = 'nodejs'

const GH_OWNER = 'nickujung-art'
const GH_REPO = 'bds'
const CUSTOM_WORKFLOW_ID = 'custom-cardnews.yml'

export async function GET(request: Request): Promise<NextResponse> {
  // 어드민 권한 검증
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes((profile as { role: string } | null)?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const runIdParam = url.searchParams.get('run_id')

  try {
    let runId: number
    if (runIdParam) {
      runId = parseInt(runIdParam, 10)
    } else {
      // run_id 없으면 최근 workflow_dispatch run 조회
      const latestRun = await getLatestWorkflowRun(GH_OWNER, GH_REPO, CUSTOM_WORKFLOW_ID)
      if (!latestRun) return NextResponse.json({ status: 'pending', download_url: null })
      runId = latestRun.id
    }

    const artifacts = await getRunArtifacts(GH_OWNER, GH_REPO, runId)
    if (!artifacts.length) {
      return NextResponse.json({ status: 'pending', download_url: null })
    }

    // 첫 번째 artifact (custom-card-*) 의 다운로드 URL 획득
    const downloadUrl = await getArtifactDownloadUrl(GH_OWNER, GH_REPO, artifacts[0].id)

    return NextResponse.json({
      status: 'ready',
      download_url: downloadUrl,
      artifact_name: artifacts[0].name,
      size_bytes: artifacts[0].size_in_bytes,
      expires_info: 'artifact는 30일 후 만료됩니다',
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'artifact fetch failed'
    }, { status: 500 })
  }
}
