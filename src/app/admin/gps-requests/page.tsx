import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { GpsActionButtons } from './GpsActionButtons'

export const revalidate = 0

export default async function GpsRequestsPage() {
  // Admin guard
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/gps-requests')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'superadmin'].includes((profile as { role: string } | null)?.role ?? '')) {
    redirect('/')
  }

  const adminClient = createSupabaseAdminClient()

  // pending 신청 목록 조회
  const { data: requests } = await adminClient
    .from('gps_verification_requests')
    .select(`
      id, doc_type, storage_path, status, created_at,
      user_id,
      profiles!gps_verification_requests_user_id_fkey(nickname),
      complexes!gps_verification_requests_complex_id_fkey(canonical_name)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  // 각 신청의 storage_path에 대해 서버 사이드 signed URL 생성 (CR-03: path traversal 방지)
  const requestsWithSignedUrls = await Promise.all(
    (requests ?? []).map(async (req) => {
      const { data: signedData } = await adminClient.storage
        .from('gps-docs')
        .createSignedUrl(req.storage_path, 60 * 10) // 10분 유효
      return { ...req, signedUrl: signedData?.signedUrl ?? null }
    })
  )

  return (
    <main className="admin-page-content">
      <h1 style={{
        font: '700 24px/1.25 var(--font-sans)',
        letterSpacing: '-0.024em',
        color: 'var(--fg-pri)',
        marginBottom: '24px',
      }}>
        GPS L3 인증 신청 검토
      </h1>

      {requestsWithSignedUrls.length === 0 ? (
        <p style={{ font: '500 13px/1.6 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
          검토 대기 중인 신청이 없습니다.
        </p>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="admin-table-wrap">
          <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{
                background: 'var(--bg-surface-2)',
                borderBottom: '1px solid var(--line-default)',
              }}>
                <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left' }}>회원</th>
                <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left' }}>단지</th>
                <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left' }}>서류 종류</th>
                <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left' }}>파일</th>
                <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left' }}>신청일</th>
                <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'center' }}>처리</th>
              </tr>
            </thead>
            <tbody>
              {requestsWithSignedUrls.map((req, idx) => {
                const nickname = (req.profiles as { nickname?: string } | null)?.nickname ?? '—'
                const complexName = (req.complexes as { canonical_name?: string } | null)?.canonical_name ?? '—'
                return (
                  <tr
                    key={req.id}
                    style={{ borderBottom: idx < requestsWithSignedUrls.length - 1 ? '1px solid var(--line-subtle)' : 'none' }}
                  >
                    <td style={{ padding: '12px 16px', font: '500 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)' }}>{nickname}</td>
                    <td style={{ padding: '12px 16px', font: '500 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)' }}>{complexName}</td>
                    <td style={{ padding: '12px 16px', font: '500 13px/1.3 var(--font-sans)', color: 'var(--fg-sec)' }}>{req.doc_type}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {req.signedUrl ? (
                        <a
                          href={req.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--dj-orange)' }}
                        >
                          파일 보기
                        </a>
                      ) : (
                        <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                          파일 없음
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                      {new Date(req.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <GpsActionButtons requestId={req.id} userId={req.user_id} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </main>
  )
}
