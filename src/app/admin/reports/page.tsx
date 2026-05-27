import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { ReportActions } from '@/components/admin/ReportActions'

export const revalidate = 0
export const metadata: Metadata = { title: '관리자 · 신고 큐' }

function formatDateTime(s: string) {
  return new Date(s).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface ReportRow {
  id: string
  target_type: 'review' | 'user' | 'ad' | 'comment'
  target_id: string
  reason: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

function getSlaState(createdAt: string): 'ok' | 'warning' | 'overdue' {
  const hours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
  if (hours > 24) return 'overdue'
  if (hours > 16) return 'warning'
  return 'ok'
}

const SLA_STYLE: Record<
  ReturnType<typeof getSlaState>,
  { bg: string; color: string; label: (h: number) => string }
> = {
  ok:      { bg: 'var(--bg-surface-2)',       color: 'var(--fg-sec)',      label: (h) => `${Math.round(h)}h 전` },
  warning: { bg: 'var(--bg-cautionary-tint)', color: '#d97706',            label: (h) => `${Math.round(h)}h — 임박` },
  overdue: { bg: 'var(--bg-negative-tint)',   color: 'var(--fg-negative)', label: (h) => `${Math.round(h)}h — 초과` },
}

const STATUS_LABEL: Record<ReportRow['status'], string> = {
  pending:  '대기',
  accepted: '처리 완료',
  rejected: '기각',
}

const STATUS_COLOR: Record<ReportRow['status'], string> = {
  pending:  '#d97706',
  accepted: '#16a34a',
  rejected: '#6b7280',
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; target_type?: string }>
}) {
  // 관리자 권한 확인
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/reports')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  const { status = '', target_type = '' } = await searchParams

  const adminClient = createSupabaseAdminClient()
  // reports 테이블은 Phase 3 마이그레이션으로 추가됨 — database.ts 재생성 전까지 any 캐스트
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (adminClient as any)
    .from('reports')
    .select('id, target_type, target_id, reason, status, created_at')

  if (status) {
    query = query.eq('status', status)
  }
  if (target_type) {
    query = query.eq('target_type', target_type)
  }

  const { data: reports } = await query
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })

  const rows = ((reports ?? []) as unknown) as ReportRow[]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        <h1
          style={{
            font: '700 22px/1.3 var(--font-sans)',
            letterSpacing: '-0.02em',
            margin: '0 0 16px',
          }}
        >
          신고 큐
        </h1>

        <form method="get" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <select name="status" defaultValue={status} className="input" style={{ minWidth: 120 }}>
            <option value="">상태 전체</option>
            <option value="pending">대기</option>
            <option value="accepted">처리 완료</option>
            <option value="rejected">기각</option>
          </select>
          <select name="target_type" defaultValue={target_type} className="input" style={{ minWidth: 130 }}>
            <option value="">유형 전체</option>
            <option value="review">후기</option>
            <option value="user">회원</option>
            <option value="ad">광고</option>
            <option value="comment">댓글</option>
          </select>
          <button type="submit" className="btn btn-sm btn-orange">필터</button>
          {(status || target_type) && (
            <a href="/admin/reports" className="btn btn-sm btn-secondary">초기화</a>
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
            {(status || target_type) ? '필터 조건에 맞는 신고가 없습니다.' : '접수된 신고가 없습니다.'}
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
                  {['일시', 'SLA', '대상', '대상 ID', '사유', '상태', '액션'].map(h => (
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
                {rows.map((r, i) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: i < rows.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                    }}
                  >
                    <td
                      style={{
                        padding: '12px 16px',
                        font: '500 12px/1.4 var(--font-sans)',
                        color: 'var(--fg-tertiary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatDateTime(r.created_at)}
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', minWidth: 80 }}>
                      {r.status === 'pending' ? (() => {
                        const hours = (Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60)
                        const state = getSlaState(r.created_at)
                        const slaStyle = SLA_STYLE[state]
                        return (
                          <span
                            aria-label={`신고 접수 후 ${Math.round(hours)}시간 경과 — ${state === 'ok' ? '정상' : state === 'warning' ? '임박' : '초과'}`}
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: 4,
                              font: '500 11px/1 var(--font-sans)',
                              background: slaStyle.bg,
                              color: slaStyle.color,
                            }}
                          >
                            {slaStyle.label(hours)}
                          </span>
                        )
                      })() : (
                        <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="chip sm">{r.target_type}</span>
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        font: '400 11px/1.4 var(--font-mono)',
                        color: 'var(--fg-tertiary)',
                        maxWidth: 140,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={r.target_id}
                    >
                      {r.target_id}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        font: '500 13px/1.4 var(--font-sans)',
                        maxWidth: 240,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={r.reason}
                    >
                      {r.reason}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: 4,
                          font: '600 11px/1 var(--font-sans)',
                          color: '#fff',
                          background: STATUS_COLOR[r.status],
                        }}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <ReportActions reportId={r.id} status={r.status} />
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
