import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { triggerWorkflow } from '@/services/github-actions'
import { z } from 'zod'

export const runtime = 'nodejs'

const GH_OWNER = 'nickujung-art'
const GH_REPO = 'bds'
const CUSTOM_WORKFLOW_ID = 'custom-cardnews.yml'

const RequestSchema = z.object({
  htmlCards: z.object({
    cover: z.string(),
    highlight: z.string(),
    ranking: z.string(),
    closing: z.string(),
  }),
  seriesId: z.string().regex(/^[a-z0-9-]+$/).default('custom'),
})

export async function POST(request: Request): Promise<NextResponse> {
  // 어드민 권한 검증
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes((profile as { role: string } | null)?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  const { htmlCards, seriesId } = parsed.data

  // 1. HTML 페이로드를 JSON으로 Supabase Storage에 업로드 (PITFALL-4)
  //    GitHub Actions가 public URL로 다운로드할 수 있어야 함 (PITFALL-5: public 버킷 필요)
  const adminClient = createSupabaseAdminClient()
  const filename = `payloads/${seriesId}-${Date.now()}.json`
  const buffer = Buffer.from(JSON.stringify(htmlCards))

  const { data: uploadData, error: uploadError } = await adminClient.storage
    .from('cardnews-payloads')
    .upload(filename, buffer, { contentType: 'application/json', cacheControl: '3600', upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })
  }

  const { data: { publicUrl } } = adminClient.storage.from('cardnews-payloads').getPublicUrl(uploadData.path)

  // 2. GitHub Actions custom-cardnews.yml 트리거 (PITFALL-3: GITHUB_PAT 필요)
  //    204 반환, run ID 없음 — 클라이언트는 별도 polling으로 조회 (PITFALL-2)
  try {
    await triggerWorkflow({
      owner: GH_OWNER,
      repo: GH_REPO,
      workflowId: CUSTOM_WORKFLOW_ID,
      ref: 'main',
      inputs: { payload_url: publicUrl, series_id: seriesId },
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'GitHub Actions trigger failed'
    }, { status: 502 })
  }

  const run_url = `https://github.com/${GH_OWNER}/${GH_REPO}/actions/workflows/${CUSTOM_WORKFLOW_ID}`

  return NextResponse.json({
    ok: true,
    payload_url: publicUrl,
    run_url,
    message: 'PNG 생성이 시작되었습니다. GitHub Actions에서 진행 상황을 확인하세요. (약 5~15분 소요)',
  })
}
