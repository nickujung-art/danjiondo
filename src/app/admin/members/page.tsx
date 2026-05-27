import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { MemberActions } from '@/components/admin/MemberActions'

export const revalidate = 0
export const metadata: Metadata = { title: '관리자 · 회원 관리' }

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

interface MemberRow {
  id: string
  nickname: string | null
  cafe_nickname: string | null
  role: string | null
  created_at: string
  suspended_at: string | null
  deleted_at: string | null
  terms_agreed_at: string | null
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string }>
}) {
  // 관리자 권한 확인
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/members')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  const { q: rawQ = '', role = '', status = '' } = await searchParams
  const q = rawQ.trim().slice(0, 50)  // 최대 50자 제한 (ilike injection 방어)

  const adminClient = createSupabaseAdminClient()
  let query = adminClient
    .from('profiles')
    .select('id, nickname, cafe_nickname, role, created_at, suspended_at, deleted_at, terms_agreed_at')

  if (q) {
    query = query.or(`nickname.ilike.%${q}%,cafe_nickname.ilike.%${q}%`)
  }
  if (role) {
    query = query.eq('role', role)
  }
  if (status === 'active') {
    query = query.is('suspended_at', null).is('deleted_at', null)
  } else if (status === 'suspended') {
    query = query.not('suspended_at', 'is', null)
  } else if (status === 'deleted') {
    query = query.not('deleted_at', 'is', null)
  }

  const { data: members } = await query.order('created_at', { ascending: false })

  const rows = (members ?? []) as MemberRow[]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        <h1
          style={{
            font: '700 22px/1.3 var(--font-sans)',
            letterSpacing: '-0.02em',
            margin: '0 0 16px',
          }}
        >
          회원 관리
        </h1>

        <form method="get" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="닉네임 / 카페닉네임"
            className="input"
            style={{ minWidth: 180 }}
            maxLength={50}
          />
          <select name="role" defaultValue={role} className="input" style={{ minWidth: 100 }}>
            <option value="">역할 전체</option>
            <option value="admin">admin</option>
            <option value="member">member</option>
          </select>
          <select name="status" defaultValue={status} className="input" style={{ minWidth: 100 }}>
            <option value="">상태 전체</option>
            <option value="active">활성</option>
            <option value="suspended">정지</option>
            <option value="deleted">탈퇴</option>
          </select>
          <button type="submit" className="btn btn-sm btn-orange">검색</button>
          {(q || role || status) && (
            <a href="/admin/members" className="btn btn-sm btn-secondary">초기화</a>
          )}
        </form>

        {rows.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 40,
              textAlign: 'center',
              font: '500 14px/1.6 var(--font-sans)',
              color: 'var(--fg-tertiary)',
            }}
          >
            {(q || role || status) ? '검색 조건에 맞는 회원이 없습니다.' : '등록된 회원이 없습니다.'}
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
                  {['닉네임', '카페 닉네임', '역할', '가입일', '동의', '상태', '액션'].map(h => (
                    <th
                      key={h}
                      scope="col"
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
                {rows.map((m, i) => (
                  <tr
                    key={m.id}
                    style={{
                      borderBottom: i < rows.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                    }}
                  >
                    <td style={{ padding: '12px 16px', font: '600 13px/1.3 var(--font-sans)' }}>
                      {m.nickname ?? '—'}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        font: '500 13px/1.3 var(--font-sans)',
                        color: 'var(--fg-sec)',
                      }}
                    >
                      {m.cafe_nickname ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="chip sm">{m.role ?? 'user'}</span>
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        font: '500 12px/1.4 var(--font-sans)',
                        color: 'var(--fg-tertiary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.created_at ? formatDate(m.created_at) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          font: '500 11px/1 var(--font-sans)',
                          color: m.terms_agreed_at ? '#16a34a' : '#d97706',
                        }}
                      >
                        {m.terms_agreed_at ? '동의' : '미동의'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 4,
                          font: '600 11px/1 var(--font-sans)',
                          color: '#fff',
                          background: m.deleted_at
                            ? '#9ca3af'
                            : m.suspended_at
                              ? '#dc2626'
                              : '#16a34a',
                        }}
                      >
                        {m.deleted_at ? '탈퇴' : m.suspended_at ? '정지' : '정상'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {m.deleted_at ? (
                        <span
                          style={{
                            font: '500 11px/1 var(--font-sans)',
                            color: 'var(--fg-tertiary)',
                          }}
                        >
                          —
                        </span>
                      ) : (
                        <MemberActions memberId={m.id} isSuspended={m.suspended_at !== null} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
  )
}
