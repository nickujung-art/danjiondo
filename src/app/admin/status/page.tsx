import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0
export const metadata: Metadata = { title: '관리자 · 시스템 상태' }

interface DataSourceRow {
  id: string
  ui_label: string | null
  cadence: string
  expected_freshness_hours: number
  last_synced_at: string | null
  last_status: string | null
  consecutive_failures: number
  error_message: string | null
}

interface CronGroup {
  title: string
  note?: string
  ids: string[]
}

const CRON_GROUPS: CronGroup[] = [
  {
    title: '국토부 실거래',
    note: '매일 04:00 KST 수집 (GitHub Actions). 신고 익일 공개 기준.',
    ids: ['molit_trade', 'molit_villa_trade', 'molit_offi_trade'],
  },
  {
    title: 'Vercel 일배치',
    note: '매일 04:00 KST (K-apt·분양·청약홈·오피스텔·갭통계)',
    ids: ['daily-batch', 'gap-stats'],
  },
  {
    title: 'GitHub Actions 워커',
    ids: ['notify-worker', 'rankings', 'cafe-articles'],
  },
]

function formatDateTime(s: string) {
  return new Date(s).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatElapsed(s: string): string {
  const diff = Date.now() - new Date(s).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days > 0)  return `${days}일 전`
  if (hours > 0) return `${hours}시간 전`
  if (mins > 0)  return `${mins}분 전`
  return '방금 전'
}

function cronBadge(row: DataSourceRow): { label: string; bg: string } {
  if (!row.last_synced_at) return { label: '미실행', bg: '#6b7280' }
  const elapsedHours = (Date.now() - new Date(row.last_synced_at).getTime()) / 3_600_000
  if (row.last_status === 'failed') return { label: '실패', bg: '#dc2626' }
  if (elapsedHours > row.expected_freshness_hours * 1.5) return { label: '지연', bg: '#d97706' }
  if (row.last_status === 'partial') return { label: '부분성공', bg: '#d97706' }
  return { label: '정상', bg: '#16a34a' }
}

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

function SourceRow({ row, isLast }: { row: DataSourceRow; isLast: boolean }) {
  const badge = cronBadge(row)
  const hasError = (row.last_status === 'failed' || row.last_status === 'partial') && row.error_message
  return (
    <>
      <tr style={{ borderBottom: !isLast || hasError ? '1px solid var(--line-subtle)' : 'none' }}>
        <td style={{ padding: '10px 16px' }}>
          <div style={{ font: '500 13px/1.3 var(--font-sans)' }}>
            {row.ui_label ?? row.id}
          </div>
          <div style={{ font: '400 11px/1.3 var(--font-mono)', color: 'var(--fg-tertiary)', marginTop: 2 }}>
            {row.id}
          </div>
        </td>
        <td style={{ padding: '10px 16px', font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)', whiteSpace: 'nowrap' }}>
          {row.last_synced_at ? formatDateTime(row.last_synced_at) : '—'}
        </td>
        <td style={{ padding: '10px 16px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', whiteSpace: 'nowrap' }}>
          {row.last_synced_at ? formatElapsed(row.last_synced_at) : '—'}
        </td>
        <td style={{ padding: '10px 16px' }}>
          <span style={{
            display: 'inline-block',
            padding: '3px 8px',
            borderRadius: 4,
            font: '600 11px/1 var(--font-sans)',
            color: '#fff',
            background: badge.bg,
          }}>
            {badge.label}
          </span>
        </td>
        <td style={{ padding: '10px 16px', font: '500 12px/1 var(--font-sans)', color: row.consecutive_failures > 0 ? '#dc2626' : 'var(--fg-tertiary)' }}>
          {row.consecutive_failures > 0 ? `${row.consecutive_failures}회` : '—'}
        </td>
      </tr>
      {hasError && (
        <tr style={{ borderBottom: isLast ? 'none' : '1px solid var(--line-subtle)' }}>
          <td colSpan={5} style={{ padding: '0 16px 10px 32px' }}>
            <code style={{ font: '400 11px/1.5 var(--font-mono)', color: '#dc2626' }}>
              {row.error_message}
            </code>
          </td>
        </tr>
      )}
    </>
  )
}

function CronGroupTable({ group, sourceMap }: { group: CronGroup; sourceMap: Map<string, DataSourceRow> }) {
  const rows = group.ids.map(id => sourceMap.get(id)).filter(Boolean) as DataSourceRow[]
  if (rows.length === 0) return null
  return (
    <section aria-labelledby={`group-${group.title}`} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <h3
          id={`group-${group.title}`}
          style={{ font: '600 13px/1.4 var(--font-sans)', margin: 0 }}
        >
          {group.title}
        </h3>
        {group.note && (
          <span style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
            {group.note}
          </span>
        )}
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line-default)', background: 'var(--bg-surface-2)' }}>
              {['작업', '마지막 실행', '경과', '상태', '연속실패'].map(h => (
                <th
                  key={h}
                  scope="col"
                  style={{
                    padding: '8px 16px',
                    font: '600 11px/1 var(--font-sans)',
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
            {rows.map((row, i) => (
              <SourceRow key={row.id} row={row} isLast={i === rows.length - 1} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default async function AdminStatusPage() {
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
    dataSourcesRes,
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
      .from('data_sources')
      .select('id, ui_label, cadence, expected_freshness_hours, last_synced_at, last_status, consecutive_failures, error_message')
      .order('id'),
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

  const dataSources = (dataSourcesRes.data ?? []) as unknown as DataSourceRow[]
  const sourceMap = new Map(dataSources.map(s => [s.id, s]))
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
          Cron / 배치 현황
        </h2>
        {CRON_GROUPS.map(group => (
          <CronGroupTable key={group.title} group={group} sourceMap={sourceMap} />
        ))}
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
