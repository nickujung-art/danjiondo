import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  // Admin guard
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'superadmin'].includes((profile as { role: string } | null)?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // formData 또는 JSON 파싱
  let requestId: string
  let userId: string
  let action: 'approve' | 'reject'

  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData()
    requestId = formData.get('requestId') as string
    userId    = formData.get('userId') as string
    action    = formData.get('action') as 'approve' | 'reject'
  } else {
    const body = await request.json().catch(() => null) as { requestId?: string; userId?: string; action?: string } | null
    requestId = body?.requestId ?? ''
    userId    = body?.userId ?? ''
    action    = (body?.action as 'approve' | 'reject') ?? 'reject'
  }

  if (!requestId || !userId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const adminClient = createSupabaseAdminClient()
  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  // gps_verification_requests 상태 업데이트
  const { error: updateErr } = await adminClient
    .from('gps_verification_requests')
    .update({
      status:      newStatus,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  if (updateErr) {
    console.error('[gps-approve] update error:', updateErr)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // 승인 시 profiles.gps_badge_level = 3
  if (action === 'approve') {
    const { error: profileErr } = await adminClient
      .from('profiles')
      .update({ gps_badge_level: 3 })
      .eq('id', userId)

    if (profileErr) {
      // profile 업데이트 실패 시 request를 pending으로 롤백 (재시도 가능하게)
      try {
        await adminClient
          .from('gps_verification_requests')
          .update({ status: 'pending', reviewed_by: null, reviewed_at: null })
          .eq('id', requestId)
      } catch { /* 롤백 실패는 무시 */ }
      console.error('[gps-approve] profile update error:', profileErr)
      return NextResponse.json({ error: 'profile update failed' }, { status: 500 })
    }
  }

  // form submit은 redirect로 응답
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return NextResponse.redirect(new URL('/admin/gps-requests', request.url))
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
