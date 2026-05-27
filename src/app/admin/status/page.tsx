import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0
export const metadata: Metadata = { title: '관리자 · 시스템 상태' }

interface RunRow {
  source_id: string
  status: string
  started_at: string
}

function formatDateTime(s: string) {
  return new Date(s).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 이번 주 월요일 날짜 반환 (YYYY-MM-DD, 로컬 시간 기준)
function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

export default async function AdminStatusPage() {
  // 관리자 권한 확인
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/status')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  const adminClient = createSupabaseAdminClient()
  const weekStart = getMonday(new Date())

  const [
    memberRes,
    complexRes,
    txRes,
    activeAdRes,
    runsRes,
    pendingReportRes,
    pendingAdRes,
    noConsentRes,
    cafeCodeRes,
  ] = await Promise.all([
    adminClient.from('profiles').select('*', { count: 'exact', head: true }),
    adminClient.from('complexes').select('*', { count: 'exact', head: true }),
    adminClient
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .is('cancel_date', null)
      .is('superseded_by', null),
    adminClient
      .from('ad_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved'),
    adminClient
      .from('ingest_runs')
      .select('source_id, status, started_at')
      .order('started_at', { ascending: false })
      .limit(10),
    adminClient
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    adminClient
      .from('ad_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    adminClient
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .is('terms_agreed_at', null),
    adminClient
      .from('cafe_join_codes')
      .select('code, week_start, created_at')
      .eq('week_start', weekStart)
      .single(),
  ])

  const runs = (runsRes.data ?? []) as unknown as RunRow[]
  const cafeCode = cafeCodeRes.data

  const dbStats = [
    { label: '회원 수', value: memberRes.count ?? 0 },
    { label: '단지 수', value: complexRes.count ?? 0 },
    { label: '거래 수 (유효)', value: txRes.count ?? 0 },
    { label: '게재 광고 수', value: activeAdRes.count ?? 0 },
  ]

  const queueStats = [
    {
      label: '대기 신고',
      value: pendingReportRes.count ?? 0,
      alert: (pendingReportRes.count ?? 0) > 0,
    },
    {
      label: '광고 검토 대기',
      value: pendingAdRes.count ?? 0,
      alert: (pendingAdRes.count ?? 0) > 0,
    },
    {
      label: '약관 미동의 회원',
      value: noConsentRes.count ?? 0,
      alert: false,
    },
  ]

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        <h1
          style={{
            font: '700 22px/1.3 var(--font-sans)',
            letterSpacing: '-0.02em',
            margin: '0 0 20px',
          }}
        >
          시스템 상태
        </h1>

        {/* 카페 가입 코드 섹션 */}
        <section aria-labelledby="cafe-code-heading" style={{ marginBottom: 24 }}>
          <h2
            id="cafe-code-heading"
            style={{ font: '700 14px/1.4 var(--font-sans)', margin: '0 0 12px' }}
          >
            이번 주 카페 가입 코드
          </h2>
          <div className="card" style={{ padding: 20 }}>
            {cafeCode ? (
              <div>
                <div
                  className="tnum"
                  style={{
                    font:          '700 28px/1 var(--font-mono, monospace)',
                    color:         'var(--dj-orange)',
                    letterSpacing: '0.1em',
                    marginBottom:  8,
                  }}
                >
                  {cafeCode.code}
                </div>
                <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                  {weekStart} 주 발행 · {new Date(cafeCode.created_at).toLocaleDateString('ko-KR')} 생성
                </div>
              </div>
            ) : (
              <div>
                <p style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 12px' }}>
                  이번 주 코드가 아직 생성되지 않았습니다.
                </p>
                <p style={{ font: '500 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                  매주 월요일 09:05 KST에 자동 생성됩니다.
                </p>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="db-heading" style={{ marginBottom: 24 }}>
          <h2
            id="db-heading"
            style={{ font: '700 14px/1.4 var(--font-sans)', margin: '0 0 12px' }}
          >
            DB 현황
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {dbStats.map(s => (
              <div
                key={s.label}
                className="card"
                style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                <span
                  className="tnum"
                  style={{ font: '700 24px/1 var(--font-sans)' }}
                >
                  {s.value.toLocaleString('ko-KR')}
                </span>
                <span style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)' }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="cron-heading" style={{ marginBottom: 24 }}>
          <h2
            id="cron-heading"
            style={{ font: '700 14px/1.4 var(--font-sans)', margin: '0 0 12px' }}
          >
            Cron 실행 이력 (최근 10건)
          </h2>
          {runs.length === 0 ? (
            <div
              className="card"
              style={{
                padding: 16,
                font: '500 13px/1.4 var(--font-sans)',
                color: 'var(--fg-tertiary)',
              }}
            >
              실행 이력이 없습니다.
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
                    {['일시', '소스', '상태'].map(h => (
                      <th
                        key={h}
                        scope="col"
                        style={{
                          padding: '10px 16px',
                          font: '600 12px/1 var(--font-sans)',
                          color: 'var(--fg-sec)',
                          textAlign: 'left',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr
                      key={`${r.source_id}_${r.started_at}_${i}`}
                      style={{
                        borderBottom:
                          i < runs.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                      }}
                    >
                      <td
                        style={{
                          padding: '10px 16px',
                          font: '500 12px/1.4 var(--font-sans)',
                          color: 'var(--fg-tertiary)',
                        }}
                      >
                        {formatDateTime(r.started_at)}
                      </td>
                      <td
                        style={{
                          padding: '10px 16px',
                          font: '400 11px/1.4 var(--font-mono)',
                          color: 'var(--fg-tertiary)',
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={r.source_id}
                      >
                        {r.source_id}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 4,
                            font: '600 11px/1 var(--font-sans)',
                            color: '#fff',
                            background:
                              r.status === 'success'
                                ? '#16a34a'
                                : r.status === 'failed'
                                  ? '#dc2626'
                                  : '#6b7280',
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="queue-heading" style={{ marginBottom: 24 }}>
          <h2
            id="queue-heading"
            style={{ font: '700 14px/1.4 var(--font-sans)', margin: '0 0 12px' }}
          >
            대기 항목
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {queueStats.map(s => (
              <div
                key={s.label}
                className="card"
                style={{
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  border: s.alert ? '1px solid #d97706' : undefined,
                }}
              >
                <span
                  className="tnum"
                  style={{
                    font: '700 24px/1 var(--font-sans)',
                    color: s.alert ? '#d97706' : undefined,
                  }}
                >
                  {s.value.toLocaleString('ko-KR')}
                </span>
                <span style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)' }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
  )
}
