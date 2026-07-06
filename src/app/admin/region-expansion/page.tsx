import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getLatestWorkflowRun } from '@/services/github-actions'

export const revalidate = 0
export const metadata: Metadata = { title: '관리자 · 전국 DB 확장 (Phase 33)' }

// 임시 운영 대시보드 — Phase 33(경남 전체 확장) 완료 후 삭제 예정.
// 지역 코드 구분은 scripts/seed.ts / seed-region.test.ts와 동일한 기준을 따른다.
const OLD_CODES = ['48121', '48123', '48125', '48127', '48129', '48250']
const NEW_CODES = [
  '48170', '48220', '48240', '48270', '48310', '48330',
  '48720', '48730', '48740', '48820', '48840', '48850',
  '48860', '48870', '48880', '48890',
]

const GH_OWNER = 'nickujung-art'
const GH_REPO = 'danjiondo'
const BACKFILL_WORKFLOW = 'molit-backfill-once.yml'

interface RegionRow {
  sgg_code: string
  sgg_name: string
  si: string
  gu: string | null
}

interface RegionProgress {
  code: string
  name: string
  ingestDone: number
  complexCount: number
  txCount: number
}

const WAVE_PLANS: Array<{ id: string; label: string; done: boolean }> = [
  { id: '33-00', label: 'regions 경남 16개 신규 시딩 + 공용 헬퍼', done: true },
  { id: '33-01', label: 'invest/gap-analysis 동적 지역 필터', done: true },
  { id: '33-02', label: 'rankings.ts/rankings-page.ts 동적 전환', done: true },
  { id: '33-03', label: 'cron/청약홈/분양권전매 동적 전환', done: true },
  { id: '33-04', label: '학군 무구(無區) 시군구 회귀 테스트', done: true },
  { id: '33-05', label: 'UI 지역 라벨 10개 파일 추가', done: true },
  { id: '33-06', label: 'KAPT Golden Record 시딩 (complexes 788건)', done: true },
  { id: '33-09', label: '/map · 광고 사이드바 동적 전환', done: true },
  { id: '33-10', label: '미분양·오피스텔 Golden Record 동적 전환', done: true },
  { id: '33-07', label: '국토부 실거래가 10년 다회 분할 백필', done: false },
  { id: '33-08', label: 'Supabase 용량 실측 + Pro 플랜 결정', done: false },
]

function formatDateTime(s: string): string {
  return new Date(s).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function runStatusBadge(status: string, conclusion: string | null): { label: string; bg: string } {
  if (status === 'in_progress' || status === 'queued') return { label: '진행 중', bg: '#2563eb' }
  if (conclusion === 'success') return { label: '성공', bg: '#16a34a' }
  if (conclusion === 'cancelled') return { label: '타임아웃/취소', bg: '#d97706' }
  if (conclusion === 'failure') return { label: '실패', bg: '#dc2626' }
  return { label: status, bg: '#6b7280' }
}

export default async function RegionExpansionDashboard() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/region-expansion')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  const adminClient = createSupabaseAdminClient()

  const [regionsRes, oldIngestRes, latestRun] = await Promise.all([
    adminClient
      .from('regions')
      .select('sgg_code, sgg_name, si, gu')
      .in('sgg_code', NEW_CODES),
    adminClient
      .from('ingest_runs')
      .select('*', { count: 'exact', head: true })
      .in('source_id', ['molit_trade', 'molit_villa_trade'])
      .in('sgg_code', OLD_CODES)
      .eq('status', 'success'),
    getLatestWorkflowRun(GH_OWNER, GH_REPO, BACKFILL_WORKFLOW).catch(() => null),
  ])

  const regionRows = (regionsRes.data ?? []) as RegionRow[]
  const nameMap = new Map(regionRows.map(r => [r.sgg_code, r.gu ? `${r.si} ${r.gu}` : r.si]))

  // 완전 백필된 기존 6개 지역 평균 성공 건수 — 신규 지역 진행률 참고 기준치
  const referenceTarget = Math.round((oldIngestRes.count ?? 0) / OLD_CODES.length) || 1

  const perRegion: RegionProgress[] = await Promise.all(
    NEW_CODES.map(async (code) => {
      const [ingestRes, complexRes, txRes] = await Promise.all([
        adminClient
          .from('ingest_runs')
          .select('*', { count: 'exact', head: true })
          .in('source_id', ['molit_trade', 'molit_villa_trade'])
          .eq('sgg_code', code)
          .eq('status', 'success'),
        adminClient
          .from('complexes')
          .select('*', { count: 'exact', head: true })
          .eq('sgg_code', code),
        adminClient
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('sgg_code', code)
          .is('cancel_date', null)
          .is('superseded_by', null),
      ])
      return {
        code,
        name: nameMap.get(code) ?? code,
        ingestDone: ingestRes.count ?? 0,
        complexCount: complexRes.count ?? 0,
        txCount: txRes.count ?? 0,
      }
    }),
  )

  const totalComplexes = perRegion.reduce((sum, r) => sum + r.complexCount, 0)
  const totalTx = perRegion.reduce((sum, r) => sum + r.txCount, 0)
  const regionsFullyDone = perRegion.filter(r => r.ingestDone >= referenceTarget * 0.9).length

  const wavesDone = WAVE_PLANS.filter(p => p.done).length

  return (
    <main className="admin-page-content">
      <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
        전국 DB 확장 — Phase 33 진행 현황
      </h1>
      <p style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 20px' }}>
        임시 운영 대시보드 · 경남 전체 확장 1단계 · Phase 33 완료 후 삭제 예정
      </p>

      {/* 개요 카드 */}
      <section aria-labelledby="overview-heading" style={{ marginBottom: 24 }}>
        <h2 id="overview-heading" style={{ font: '700 14px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
          개요
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {[
            { label: '활성 지역 (기존+신규)', value: `${OLD_CODES.length + NEW_CODES.length}개` },
            { label: '완료된 계획 (Wave 0·1)', value: `${wavesDone}/${WAVE_PLANS.length}` },
            { label: '백필 완료 지역 (참고 기준 90%↑)', value: `${regionsFullyDone}/${NEW_CODES.length}` },
            { label: '신규 지역 단지 수', value: totalComplexes.toLocaleString('ko-KR') },
            { label: '신규 지역 거래 수 (유효)', value: totalTx.toLocaleString('ko-KR') },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="tnum" style={{ font: '700 22px/1 var(--font-sans)' }}>{s.value}</span>
              <span style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 자동 진행 */}
      <section aria-labelledby="auto-heading" style={{ marginBottom: 24 }}>
        <h2 id="auto-heading" style={{ font: '700 14px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
          자동으로 진행되는 부분
        </h2>

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ font: '600 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 8 }}>
            Phase 33 계획 진행 ({wavesDone}/{WAVE_PLANS.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {WAVE_PLANS.map(p => (
              <span
                key={p.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  font: '600 11px/1 var(--font-sans)',
                  background: p.done ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)',
                  color: p.done ? '#16a34a' : '#d97706',
                }}
              >
                {p.done ? '✓' : '○'} {p.id} {p.label}
              </span>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-subtle)' }}>
            <div style={{ font: '600 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)' }}>
              국토부 실거래가 백필 진행률 (지역별)
            </div>
            <div style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 2 }}>
              참고 기준치: 기존 완료 지역(창원·김해) 평균 {referenceTarget.toLocaleString('ko-KR')}건 성공 = 100%
            </div>
          </div>
          <div className="admin-table-wrap">
            <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-default)', background: 'var(--bg-surface-2)' }}>
                  {['지역', '진행률', '완료 건수', '단지 수', '거래 수'].map(h => (
                    <th key={h} scope="col" style={{ padding: '8px 16px', font: '600 11px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'left', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perRegion.map((r, i) => {
                  const pct = Math.min(100, Math.round((r.ingestDone / referenceTarget) * 100))
                  return (
                    <tr key={r.code} style={{ borderBottom: i === perRegion.length - 1 ? 'none' : '1px solid var(--line-subtle)' }}>
                      <td style={{ padding: '10px 16px', font: '500 13px/1.3 var(--font-sans)' }}>{r.name}</td>
                      <td style={{ padding: '10px 16px', minWidth: 140 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? '#16a34a' : '#2563eb' }} />
                          </div>
                          <span className="tnum" style={{ font: '600 11px/1 var(--font-sans)', color: 'var(--fg-sec)', minWidth: 32, textAlign: 'right' }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="tnum" style={{ padding: '10px 16px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                        {r.ingestDone.toLocaleString('ko-KR')}
                      </td>
                      <td className="tnum" style={{ padding: '10px 16px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                        {r.complexCount.toLocaleString('ko-KR')}
                      </td>
                      <td className="tnum" style={{ padding: '10px 16px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                        {r.txCount.toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ font: '600 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 8 }}>
            GitHub Actions 최신 실행 ({BACKFILL_WORKFLOW})
          </div>
          {latestRun ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {(() => {
                const badge = runStatusBadge(latestRun.status, latestRun.conclusion)
                return (
                  <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 4, font: '600 11px/1 var(--font-sans)', color: '#fff', background: badge.bg }}>
                    {badge.label}
                  </span>
                )
              })()}
              <span style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)' }}>
                {formatDateTime(latestRun.created_at)} 시작
              </span>
              <a href={latestRun.html_url} target="_blank" rel="noreferrer" style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--dj-orange)' }}>
                GitHub에서 보기 →
              </a>
            </div>
          ) : (
            <p style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
              실행 이력을 불러오지 못했습니다 (GITHUB_PAT 미설정이거나 아직 트리거 전).
            </p>
          )}
        </div>
      </section>

      {/* 수동 진행 필요 */}
      <section aria-labelledby="manual-heading" style={{ marginBottom: 24 }}>
        <h2 id="manual-heading" style={{ font: '700 14px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
          수동 진행이 필요한 부분 (체크포인트)
        </h2>

        <div className="card" style={{ padding: 16, marginBottom: 12, border: '1px solid #d97706' }}>
          <div style={{ font: '700 13px/1.4 var(--font-sans)', marginBottom: 6 }}>
            33-07 · 국토부 실거래가 10년 백필
          </div>
          <p style={{ font: '500 12px/1.5 var(--font-sans)', color: 'var(--fg-sec)', margin: '0 0 8px' }}>
            API 일 10,000회 한도로 1회 실행(최대 300분)으로 끝나지 않을 수 있습니다. 위 진행률 표에서 100%에 못 미친 지역이 남아있으면,
            다음 영업일 04:00 KST 일배치 cron과 겹치지 않는 시간대에 아래 명령으로 재트리거하세요 (--resume 자동 적용, 이미 완료된 월은 건너뜁니다).
          </p>
          <pre style={{ font: '400 11px/1.6 var(--font-mono)', background: 'var(--bg-surface-2)', padding: '10px 12px', borderRadius: 6, overflowX: 'auto', margin: 0 }}>
{`gh workflow run molit-backfill-once.yml \\
  -f sgg_codes=48170,48220,48240,48270,48310,48330,48720,48730,48740,48820,48840,48850,48860,48870,48880,48890`}
          </pre>
        </div>

        <div className="card" style={{ padding: 16, border: '1px solid #d97706' }}>
          <div style={{ font: '700 13px/1.4 var(--font-sans)', marginBottom: 6 }}>
            33-08 · Supabase 용량 실측 + Pro 플랜 결정
          </div>
          <p style={{ font: '500 12px/1.5 var(--font-sans)', color: 'var(--fg-sec)', margin: 0 }}>
            33-07 백필 완료 후 진행. 참고: 2026-07-03 실측 기준 DB 총 용량 375MB / 무료 한도 500MB(75%) — 경남 전체 백필 완료 시 500~580MB 예상되어
            Supabase Pro($25/월, 8GB) 전환 필요 가능성이 높습니다.
          </p>
        </div>
      </section>

      <p style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
        이 페이지는 Phase 33(전국 DB 확장 1단계) 진행 상황을 확인하기 위한 임시 운영 도구입니다. 별도 리서치/계획/검증 없이 빠르게 구현되었으며, Phase 33 완료 후 삭제 예정입니다.
      </p>
    </main>
  )
}
