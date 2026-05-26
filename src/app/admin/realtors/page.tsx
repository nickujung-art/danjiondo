import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getAllRealtors } from '@/lib/data/realtors'
import { RealtorActions } from '@/components/admin/RealtorActions'

export const revalidate = 0

export default async function AdminRealtorsPage() {
  // 관리자 권한 확인
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/realtors')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  // 서비스 롤로 전체 공인중개사 조회 (RLS 우회)
  const adminClient = createSupabaseAdminClient()
  const realtors = await getAllRealtors(adminClient)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <header
        style={{
          height: 60,
          background: '#fff',
          borderBottom: '1px solid var(--line-default)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          gap: 24,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <Link href="/" className="dj-logo">
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
        <span style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
          관리자 · 공인중개사
        </span>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1
            style={{
              font: '700 22px/1.3 var(--font-sans)',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            공인중개사 관리
          </h1>
          <Link
            href="/admin/realtors/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: 'var(--dj-orange)',
              color: '#fff',
              borderRadius: 8,
              font: '600 13px/1 var(--font-sans)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            + 새 중개사 등록
          </Link>
        </div>

        {realtors.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 40,
              textAlign: 'center',
              font: '500 14px/1.6 var(--font-sans)',
              color: 'var(--fg-tertiary)',
            }}
          >
            등록된 공인중개사가 없습니다.
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--line-default)',
                    background: 'var(--bg-surface-2)',
                  }}
                >
                  {['이름', '사무소명', '전화번호', '자격번호', '상태', '액션'].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        font: '600 12px/1 var(--font-sans)',
                        color: 'var(--fg-sec)',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {realtors.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: i < realtors.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                    }}
                  >
                    <td style={{ padding: '12px 16px', font: '600 13px/1.3 var(--font-sans)' }}>
                      <Link
                        href={`/admin/realtors/${r.id}/edit`}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 16px', font: '500 13px/1.3 var(--font-sans)', color: 'var(--fg-sec)' }}>
                      {r.agency_name}
                    </td>
                    <td style={{ padding: '12px 16px', font: '500 13px/1.3 var(--font-sans)', color: 'var(--fg-sec)' }}>
                      {r.phone}
                    </td>
                    <td style={{ padding: '12px 16px', font: '500 12px/1.3 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                      {r.license_no ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 4,
                          font: '600 11px/1 var(--font-sans)',
                          color: r.is_active ? 'var(--fg-positive)' : 'var(--fg-tertiary)',
                          background: r.is_active ? '#f0fdf4' : 'var(--bg-surface-2)',
                          border: `1px solid ${r.is_active ? '#bbf7d0' : 'var(--line-subtle)'}`,
                        }}
                      >
                        {r.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link
                          href={`/admin/realtors/${r.id}/edit`}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 5,
                            font: '600 11px/1 var(--font-sans)',
                            color: 'var(--fg-sec)',
                            border: '1px solid var(--line-default)',
                            background: 'var(--bg-surface-2)',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          수정
                        </Link>
                        <RealtorActions id={r.id} isActive={r.is_active} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
