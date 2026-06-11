import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { MemberActions } from '@/components/admin/MemberActions'

export const revalidate = 0
export const metadata: Metadata = { title: '관리자 · 회원 관리' }

const PAGE_SIZE = 50
const ALLOWED_ROLES = new Set(['admin', 'member', 'superadmin'])
const ALLOWED_STATUSES = new Set(['active', 'suspended', 'deleted'])
const ALLOWED_SORT = new Set(['created_at', 'role'])
const ALLOWED_ORDER = new Set(['asc', 'desc'])

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

function SortLink({ col, label, sortBy, order, q, role, status, page }: {
  col: string; label: string; sortBy: string; order: string
  q: string; role: string; status: string; page: number
}) {
  const isActive = sortBy === col
  const nextOrder = isActive && order === 'desc' ? 'asc' : 'desc'
  const indicator = isActive ? (order === 'asc' ? ' ▲' : ' ▼') : ''
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (role) params.set('role', role)
  if (status) params.set('status', status)
  params.set('sortBy', col)
  params.set('order', nextOrder)
  if (page > 1) params.set('page', String(page))
  return (
    <a href={`/admin/members?${params.toString()}`} style={{ color: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap' }}>
      {label}{indicator}
    </a>
  )
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string; sortBy?: string; order?: string }>
}) {
  const { q: rawQ = '', role: rawRole = '', status: rawStatus = '', page: rawPage = '1', sortBy: rawSortBy = 'created_at', order: rawOrder = 'desc' } = await searchParams

  const q = rawQ.trim().slice(0, 50)
  const role = ALLOWED_ROLES.has(rawRole) ? rawRole : ''
  const status = ALLOWED_STATUSES.has(rawStatus) ? rawStatus : ''
  const sortBy = ALLOWED_SORT.has(rawSortBy) ? rawSortBy : 'created_at'
  const order = ALLOWED_ORDER.has(rawOrder) ? rawOrder : 'desc'
  const page = Math.max(1, parseInt(rawPage, 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const adminClient = createSupabaseAdminClient()
  let query = adminClient
    .from('profiles')
    .select('id, nickname, cafe_nickname, role, created_at, suspended_at, deleted_at, terms_agreed_at', { count: 'exact' })

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

  const { data: members, error, count } = await query
    .order(sortBy, { ascending: order === 'asc' })
    .range(offset, offset + PAGE_SIZE - 1)

  if (error) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: '0 0 16px' }}>회원 관리</h1>
        <div className="card" style={{ padding: 40, textAlign: 'center', font: '500 14px/1.6 var(--font-sans)', color: 'var(--fg-negative)' }}>
          회원 데이터를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
        </div>
      </div>
    )
  }

  const rows = (members ?? []) as MemberRow[]
  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const buildPageHref = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (role) params.set('role', role)
    if (status) params.set('status', status)
    if (sortBy !== 'created_at') params.set('sortBy', sortBy)
    if (order !== 'desc') params.set('order', order)
    if (p > 1) params.set('page', String(p))
    const s = params.toString()
    return `/admin/members${s ? `?${s}` : ''}`
  }

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
          <input type="hidden" name="sortBy" value={sortBy} />
          <input type="hidden" name="order" value={order} />
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
            <Link href="/admin/members" className="btn btn-sm btn-secondary">초기화</Link>
          )}
        </form>

        {totalCount > 0 && (
          <p style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 12px' }}>
            전체 {totalCount.toLocaleString()}명 중 {offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)}명
          </p>
        )}

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
                  <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left', whiteSpace: 'nowrap' }}>닉네임</th>
                  <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left', whiteSpace: 'nowrap' }}>카페 닉네임</th>
                  <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                    <SortLink col="role" label="역할" sortBy={sortBy} order={order} q={q} role={role} status={status} page={page} />
                  </th>
                  <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                    <SortLink col="created_at" label="가입일" sortBy={sortBy} order={order} q={q} role={role} status={status} page={page} />
                  </th>
                  <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left', whiteSpace: 'nowrap' }}>동의</th>
                  <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left', whiteSpace: 'nowrap' }}>상태</th>
                  <th scope="col" style={{ padding: '10px 16px', font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left', whiteSpace: 'nowrap' }}>액션</th>
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

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', justifyContent: 'center' }}>
            {page > 1 && (
              <a href={buildPageHref(page - 1)} className="btn btn-sm btn-secondary">← 이전</a>
            )}
            <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <a href={buildPageHref(page + 1)} className="btn btn-sm btn-secondary">다음 →</a>
            )}
          </div>
        )}
      </div>
  )
}
