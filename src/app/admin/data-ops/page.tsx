import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0
export const metadata = { title: '데이터 운영 현황 — 단지온도 관리자' }

// ── 타입 ────────────────────────────────────────────────
type DataSource = {
  id: string
  ui_label: string
  last_status: string | null
  last_synced_at: string | null
  consecutive_failures: number
  error_message: string | null
}

type ManualTaskStatus = 'upcoming' | 'imminent' | 'check' | 'ondemand'

type ManualTask = {
  category: string
  name: string
  desc: string
  schedule: string
  nextDue: string
  method: string
  status: ManualTaskStatus
  note: string
}

// ── 정적 데이터 ──────────────────────────────────────────
const GH_SCHEDULES: Array<{
  freq: string
  jobs: Array<{ name: string; desc: string; time?: string }>
}> = [
  {
    freq: '5분마다',
    jobs: [{ name: '알림 워커', desc: '단지 즐겨찾기 가격 알림 발송' }],
  },
  {
    freq: '매시간',
    jobs: [{ name: '랭킹 갱신', desc: '평당가 기준 단지 순위 재계산' }],
  },
  {
    freq: '매일',
    jobs: [
      { name: 'AI 가격 예측 (Holt-Winters)', desc: '6개월 단기 예측 모델', time: '02:00 KST' },
      { name: 'Chronos 예측 + AI 코멘트', desc: '12개월 예측 · Groq 분석', time: '03:00 KST' },
      { name: '카페 기사 수집', desc: '네이버 카페 NLP 파이프라인', time: '05:00 KST' },
      { name: '신규 분양 지오코딩', desc: 'presale 좌표 자동 보완', time: '05:30 KST' },
    ],
  },
  {
    freq: '매주 월요일',
    jobs: [
      { name: '분양 뉴스 크롤', desc: '청약·분양 뉴스 자동 수집' },
      { name: '주간 다이제스트', desc: '주간 시세 리포트 생성' },
      { name: '인스타 카드뉴스', desc: '카드뉴스 자동 생성 + 포스팅' },
      { name: '카페 단지 코드', desc: '카페 게시글 단지 재매핑' },
    ],
  },
  {
    freq: '매월 1일',
    jobs: [{ name: '미분양 현황', desc: 'KOSIS 미분양 데이터 수집' }],
  },
  {
    freq: '분기 (1·4·7·10월)',
    jobs: [{ name: 'SGIS 인구·세대', desc: '지역 인구 통계 갱신' }],
  },
]

const MANUAL_TASKS: ManualTask[] = [
  {
    category: '학교',
    name: '학교 기본통계',
    desc: '학급당 학생수·교원비율',
    schedule: '매년 4~5월',
    nextDue: '2027-04',
    method: 'collect-school-stats-once.yml (workflow_dispatch)',
    status: 'check',
    note: '2024년 완료 / 2026년 실행 여부 확인 필요',
  },
  {
    category: '학교',
    name: '중학교 진학률',
    desc: '특목·자사고 진학 (Playwright 스크랩)',
    schedule: '매년 11월',
    nextDue: '2026-11',
    method: 'npx tsx scripts/scrape-school-advancement.ts --school-type=middle',
    status: 'upcoming',
    note: '학교알리미 11월 공시 갱신 후 실행',
  },
  {
    category: '학교',
    name: '고등학교 진학률',
    desc: '대학 진학 데이터 (Playwright 스크랩)',
    schedule: '매년 11월',
    nextDue: '2026-11',
    method: 'npx tsx scripts/scrape-school-advancement.ts --school-type=high',
    status: 'upcoming',
    note: '학교알리미 11월 공시 갱신 후 실행',
  },
  {
    category: '소득',
    name: '지역 가구소득',
    desc: 'KOSIS 소득 통계 (자동 cron)',
    schedule: '매년 7월 1일',
    nextDue: '2026-07-01',
    method: 'update-regional-income.yml (자동 실행)',
    status: 'imminent',
    note: '내일 GitHub Actions 자동 실행 예정',
  },
  {
    category: '학원',
    name: '학원 NEIS 전수 수집',
    desc: '교육부 학원 전체 + 분류 + 인기도',
    schedule: '연 1회 또는 필요 시',
    nextDue: '필요 시',
    method: 'fetch-hagwon-neis.ts → geocode → classify → popularity',
    status: 'ondemand',
    note: '데이터 현저히 변경됐을 때만 실행',
  },
  {
    category: 'KAPT',
    name: 'KAPT 단지정보 보완',
    desc: '신규 단지 주소·동 정보 보완',
    schedule: '대량 신규 단지 추가 시',
    nextDue: '필요 시',
    method: 'kapt-enrich-once.yml (workflow_dispatch)',
    status: 'ondemand',
    note: '1회성 보완 작업',
  },
]

// ── 유틸 ────────────────────────────────────────────────
function fmtKST(isoStr: string | null): string {
  if (!isoStr) return '—'
  const kst = new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 16).replace('T', ' ')
}

function StatusChip({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
        미실행
      </span>
    )
  }
  const map: Record<string, { bg: string; color: string; label: string }> = {
    success: { bg: '#f0fdf4', color: '#16a34a', label: '정상' },
    partial: { bg: '#fffbeb', color: '#d97706', label: '부분 성공' },
    failed:  { bg: '#fef2f2', color: '#dc2626', label: '실패' },
  }
  const s = map[status] ?? { bg: 'var(--bg-surface-2)', color: 'var(--fg-sec)', label: status }
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: 4,
      font: '600 11px/1 var(--font-sans)',
      background: s.bg,
      color: s.color,
    }}>
      {s.label}
    </span>
  )
}

function ManualChip({ status }: { status: ManualTaskStatus }) {
  const map: Record<ManualTaskStatus, { bg: string; color: string; label: string }> = {
    upcoming: { bg: '#eff6ff', color: '#2563eb', label: '대기' },
    imminent: { bg: '#fffbeb', color: '#d97706', label: '임박' },
    check:    { bg: '#fff7ed', color: '#ea580c', label: '확인 필요' },
    ondemand: { bg: 'var(--bg-surface-2)', color: 'var(--fg-sec)', label: '필요 시' },
  }
  const s = map[status]
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: 4,
      font: '600 11px/1 var(--font-sans)',
      background: s.bg,
      color: s.color,
    }}>
      {s.label}
    </span>
  )
}

// ── 페이지 ───────────────────────────────────────────────
export default async function DataOpsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/data-ops')

  const adminSb = createSupabaseAdminClient()
  const { data: profile } = await adminSb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!['admin', 'superadmin'].includes((profile as { role: string } | null)?.role ?? '')) {
    redirect('/')
  }

  const [dsResult, kaptResult, presaleResult] = await Promise.all([
    adminSb
      .from('data_sources')
      .select('id, ui_label, last_status, last_synced_at, consecutive_failures, error_message')
      .order('id'),
    adminSb
      .from('facility_kapt')
      .select('data_month')
      .not('data_month', 'is', null)
      .order('data_month', { ascending: false })
      .limit(1),
    adminSb
      .from('presale_discoveries')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])

  const dataSources = (dsResult.data as DataSource[] | null) ?? []
  const latestKaptRaw = (kaptResult.data as Array<{ data_month: string }> | null)?.[0]?.data_month ?? null
  const presalePending = presaleResult.count ?? 0

  let kaptMonthLabel = '—'
  let kaptNextLabel = '—'
  if (latestKaptRaw) {
    const d = new Date(latestKaptRaw)
    kaptMonthLabel = `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`
    const next = new Date(d)
    next.setUTCMonth(next.getUTCMonth() + 1)
    kaptNextLabel = `${next.getUTCFullYear()}년 ${next.getUTCMonth() + 1}월`
  }

  const sectionTitle: React.CSSProperties = {
    font: '600 16px/1 var(--font-sans)',
    color: 'var(--fg-pri)',
    marginBottom: 16,
    marginTop: 0,
  }
  const theadCell: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    font: '600 11px/1 var(--font-sans)',
    color: 'var(--fg-tertiary)',
    whiteSpace: 'nowrap',
  }
  const tbody: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '1px solid var(--line-subtle)',
    verticalAlign: 'top',
  }

  return (
    <main className="admin-page-content">
      <h1 style={{ font: '700 22px/1.3 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 4, marginTop: 0 }}>
        데이터 운영 현황
      </h1>
      <p style={{ font: '400 14px/1.5 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 36, marginTop: 0 }}>
        자동 크론, GitHub Actions 스케줄, 수동 실행 필요 데이터를 한눈에 확인합니다.
      </p>

      {/* ── 1. 자동 크론 현황 (data_sources) ── */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={sectionTitle}>자동 크론 현황</h2>
        <div className="admin-table-wrap">
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', font: '400 13px/1.5 var(--font-sans)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line-default)' }}>
                <th style={theadCell}>데이터 소스</th>
                <th style={theadCell}>상태</th>
                <th style={theadCell}>마지막 실행 (KST)</th>
                <th style={{ ...theadCell, textAlign: 'center' }}>연속 실패</th>
                <th style={theadCell}>비고</th>
              </tr>
            </thead>
            <tbody>
              {dataSources.map(ds => (
                <tr key={ds.id}>
                  <td style={tbody}>
                    <div style={{ font: '500 13px/1.2 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 2 }}>
                      {ds.ui_label}
                    </div>
                    <code style={{ font: '400 11px/1 var(--font-mono)', color: 'var(--fg-tertiary)' }}>
                      {ds.id}
                    </code>
                  </td>
                  <td style={tbody}><StatusChip status={ds.last_status} /></td>
                  <td style={{ ...tbody, whiteSpace: 'nowrap', color: 'var(--fg-sec)' }}>
                    {fmtKST(ds.last_synced_at)}
                  </td>
                  <td style={{ ...tbody, textAlign: 'center', color: ds.consecutive_failures > 0 ? '#dc2626' : 'var(--fg-tertiary)' }}>
                    {ds.consecutive_failures}
                  </td>
                  <td style={{ ...tbody, color: 'var(--fg-sec)', fontSize: 12, maxWidth: 220 }}>
                    {ds.last_status === 'partial' && !ds.error_message
                      ? '외부 API 일부 오류 (정상 범위)'
                      : (ds.error_message ?? '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 2. GitHub Actions 스케줄 ── */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={sectionTitle}>GitHub Actions 자동 스케줄</h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}>
          {GH_SCHEDULES.map(group => (
            <div key={group.freq} style={{
              background: 'var(--bg-surface-1)',
              border: '1px solid var(--line-subtle)',
              borderRadius: 8,
              padding: '14px 16px',
            }}>
              <div style={{
                font: '600 10px/1 var(--font-sans)',
                color: 'var(--fg-tertiary)',
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {group.freq}
              </div>
              {group.jobs.map((job, idx) => (
                <div
                  key={job.name}
                  style={{
                    paddingBottom: idx < group.jobs.length - 1 ? 8 : 0,
                    marginBottom: idx < group.jobs.length - 1 ? 8 : 0,
                    borderBottom: idx < group.jobs.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                  }}
                >
                  <div style={{ font: '500 13px/1.2 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 2 }}>
                    {job.name}
                    {job.time && (
                      <span style={{ font: '400 11px/1 var(--font-mono)', color: 'var(--fg-tertiary)', marginLeft: 8 }}>
                        {job.time}
                      </span>
                    )}
                  </div>
                  <div style={{ font: '400 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)' }}>
                    {job.desc}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. 수동 관리 영역 (관리비 + 분양) ── */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={sectionTitle}>수동 관리 영역</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {/* 관리비 */}
          <div style={{
            background: 'var(--bg-surface-1)',
            border: '1px solid var(--line-default)',
            borderRadius: 8,
            padding: 20,
          }}>
            <div style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 6 }}>
              관리비 K-apt 엑셀 업로드
            </div>
            <div style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 20 }}>
              K-apt 사이트에서 Excel 다운로드 후 수동 스크립트로 적재합니다.
            </div>
            <div style={{ display: 'flex', gap: 32, marginBottom: 20 }}>
              <div>
                <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 6 }}>
                  마지막 적재
                </div>
                <div style={{ font: '600 15px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>
                  {kaptMonthLabel}
                </div>
              </div>
              <div>
                <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 6 }}>
                  다음 필요
                </div>
                <div style={{ font: '600 15px/1 var(--font-sans)', color: '#d97706' }}>
                  {kaptNextLabel} ⚠
                </div>
              </div>
            </div>
            <div style={{
              background: 'var(--bg-surface-2)',
              borderRadius: 6,
              padding: '8px 12px',
              font: '400 11px/1.7 var(--font-mono)',
              color: 'var(--fg-sec)',
            }}>
              npx tsx scripts/import-management-cost.ts --file &lt;xlsx&gt;
            </div>
          </div>

          {/* 분양 워크플로우 */}
          <div style={{
            background: 'var(--bg-surface-1)',
            border: '1px solid var(--line-default)',
            borderRadius: 8,
            padding: 20,
          }}>
            <div style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 6 }}>
              분양 검수 워크플로우
            </div>
            <div style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 20 }}>
              자동 크롤 → presale_discoveries (pending) → 관리자 검수·승인 → 게시
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 6 }}>
                검수 대기
              </div>
              <div style={{
                font: '700 28px/1 var(--font-sans)',
                color: presalePending > 0 ? '#d97706' : 'var(--fg-pri)',
              }}>
                {presalePending}건
              </div>
            </div>
            {presalePending > 0 ? (
              <Link
                href="/admin/presale-discoveries"
                style={{
                  display: 'inline-block',
                  padding: '7px 14px',
                  background: 'var(--fg-pri)',
                  color: '#fff',
                  borderRadius: 6,
                  font: '500 13px/1 var(--font-sans)',
                  textDecoration: 'none',
                }}
              >
                검수하러 가기 →
              </Link>
            ) : (
              <Link
                href="/admin/presale-discoveries"
                style={{
                  display: 'inline-block',
                  padding: '7px 14px',
                  background: 'transparent',
                  color: 'var(--fg-sec)',
                  border: '1px solid var(--line-default)',
                  borderRadius: 6,
                  font: '500 13px/1 var(--font-sans)',
                  textDecoration: 'none',
                }}
              >
                분양 검수 페이지
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── 4. 연간/비정기 수동 실행 체크리스트 ── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={sectionTitle}>연간/비정기 수동 실행 체크리스트</h2>
        <div className="admin-table-wrap">
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', font: '400 13px/1.5 var(--font-sans)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line-default)' }}>
                <th style={theadCell}>카테고리</th>
                <th style={theadCell}>항목</th>
                <th style={theadCell}>주기</th>
                <th style={theadCell}>다음 예정</th>
                <th style={theadCell}>실행 방법</th>
                <th style={theadCell}>상태</th>
                <th style={theadCell}>비고</th>
              </tr>
            </thead>
            <tbody>
              {MANUAL_TASKS.map(task => (
                <tr key={task.name}>
                  <td style={{ ...tbody, whiteSpace: 'nowrap' }}>
                    <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                      {task.category}
                    </span>
                  </td>
                  <td style={tbody}>
                    <div style={{ font: '500 13px/1.2 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 2 }}>
                      {task.name}
                    </div>
                    <div style={{ font: '400 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                      {task.desc}
                    </div>
                  </td>
                  <td style={{ ...tbody, whiteSpace: 'nowrap', color: 'var(--fg-sec)' }}>
                    {task.schedule}
                  </td>
                  <td style={{ ...tbody, whiteSpace: 'nowrap', font: '500 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>
                    {task.nextDue}
                  </td>
                  <td style={{ ...tbody, maxWidth: 260 }}>
                    <code style={{ font: '400 11px/1.6 var(--font-mono)', color: 'var(--fg-sec)', wordBreak: 'break-all' }}>
                      {task.method}
                    </code>
                  </td>
                  <td style={{ ...tbody, whiteSpace: 'nowrap' }}>
                    <ManualChip status={task.status} />
                  </td>
                  <td style={{ ...tbody, color: 'var(--fg-sec)', fontSize: 12 }}>
                    {task.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
