import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { upsertRedevelopmentProject, setComplexRedevelopmentStatus } from '@/lib/actions/redevelopment-actions'

export const revalidate = 0
export const metadata: Metadata = { title: '관리자 · 재건축 단계 관리' }

const PHASE_OPTIONS = [
  { value: 'rumor', label: '재건축 소문' },
  { value: 'proposed', label: '추진 제안' },
  { value: 'committee_formed', label: '추진위 구성' },
  { value: 'safety_eval', label: '안전진단' },
  { value: 'designated', label: '구역 지정' },
  { value: 'business_approval', label: '사업 승인' },
  { value: 'construction_permit', label: '착공 허가' },
  { value: 'construction', label: '공사 중' },
  { value: 'completed', label: '완공' },
  { value: 'cancelled', label: '취소' },
] as const

const PHASE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  PHASE_OPTIONS.map(p => [p.value, p.label])
)

function formatDateTime(s: string) {
  return new Date(s).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface RedevelopmentRow {
  id: string
  complex_id: string | null
  project_name: string
  phase: string
  notes: string | null
  updated_at: string
}

interface ComplexRow {
  id: string
  canonical_name: string
  si: string | null
  gu: string | null
}

async function upsertRedevelopmentProjectFormAction(formData: FormData) {
  'use server'
  const complexId = (formData.get('complexId') as string) ?? ''
  const phase = (formData.get('phase') as string) ?? ''
  const notes = (formData.get('notes') as string | null)
  return upsertRedevelopmentProject(complexId, phase, notes || null)
}

async function setComplexRedevelopmentStatusFromForm(formData: FormData): Promise<void> {
  'use server'
  const complexId     = (formData.get('complexId') as string) ?? ''
  const status        = (formData.get('status') as string) ?? ''
  const predecessorId = (formData.get('predecessorId') as string) || null
  const successorId   = (formData.get('successorId') as string) || null
  await setComplexRedevelopmentStatus({
    complexId,
    status: status === 'in_redevelopment' ? 'in_redevelopment' : 'active',
    predecessorId,
    successorId,
  })
}

export default async function AdminRedevelopmentPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  // 관리자 권한 확인
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/redevelopment')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  const adminClient = createSupabaseAdminClient()

  // 재건축 단지 목록 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projects } = await (adminClient as any)
    .from('redevelopment_projects')
    .select('id, complex_id, project_name, phase, notes, updated_at')
    .order('updated_at', { ascending: false })

  // in_redevelopment 단지 목록 (기존 단계 입력 폼 select용)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: complexes } = await (adminClient as any)
    .from('complexes')
    .select('id, canonical_name, si, gu')
    .eq('status', 'in_redevelopment')
    .order('canonical_name')

  // active + in_redevelopment 전체 단지 (Phase 13 신규: 상태 변경 폼용)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: activeComplexes } = await (adminClient as any)
    .from('complexes')
    .select('id, canonical_name, si, gu, status')
    .in('status', ['active', 'in_redevelopment'])
    .order('canonical_name')
    .limit(500)

  const rows = ((projects ?? []) as unknown) as RedevelopmentRow[]
  const complexList = ((complexes ?? []) as unknown) as ComplexRow[]
  const allComplexes = ((activeComplexes ?? []) as unknown) as Array<{
    id: string
    canonical_name: string
    si: string | null
    gu: string | null
    status: string
  }>

  const { saved, error: formError } = await searchParams

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        <h1
          style={{
            font: '700 22px/1.3 var(--font-sans)',
            letterSpacing: '-0.02em',
            margin: '0 0 20px',
          }}
        >
          재건축 단계 관리
        </h1>

        {/* Phase 13 신규: 단지 status 변경 (REDV-01) */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <h2 style={{ font: '700 16px/1.4 var(--font-sans)', margin: '0 0 4px' }}>
            단지 재건축 지정
          </h2>
          <p style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)', margin: '0 0 16px' }}>
            complexes.status 를 변경하여 /presale Tier 2 (재건축 지정) 섹션에 표출하거나 해제합니다.
          </p>
          <form action={setComplexRedevelopmentStatusFromForm} aria-label="단지 재건축 상태 변경">
            {/* 단지 select */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="status-complex-select"
                style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6, display: 'block' }}
              >
                대상 단지
              </label>
              <select
                id="status-complex-select"
                name="complexId"
                className="input"
                required
                style={{ width: '100%' }}
              >
                <option value="">단지 선택</option>
                {allComplexes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.canonical_name}
                    {(c.si || c.gu) ? ` (${[c.si, c.gu].filter(Boolean).join(' ')})` : ''}
                    {' — '}
                    {c.status === 'in_redevelopment' ? '재건축 지정' : '일반'}
                  </option>
                ))}
              </select>
            </div>

            {/* status dropdown */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="status-select"
                style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6, display: 'block' }}
              >
                상태 변경
              </label>
              <select
                id="status-select"
                name="status"
                className="input"
                required
                style={{ width: '100%' }}
              >
                <option value="in_redevelopment">재건축 지정 (in_redevelopment)</option>
                <option value="active">일반으로 복원 (active)</option>
              </select>
            </div>

            {/* predecessor (기존 단지) */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="predecessor-select"
                style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6, display: 'block' }}
              >
                기존 단지 (predecessor, 선택)
              </label>
              <select
                id="predecessor-select"
                name="predecessorId"
                className="input"
                style={{ width: '100%' }}
              >
                <option value="">선택 안 함 (null)</option>
                {allComplexes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.canonical_name}
                    {(c.si || c.gu) ? ` (${[c.si, c.gu].filter(Boolean).join(' ')})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* successor (신규 단지) */}
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="successor-select"
                style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6, display: 'block' }}
              >
                신규 단지 (successor, 선택)
              </label>
              <select
                id="successor-select"
                name="successorId"
                className="input"
                style={{ width: '100%' }}
              >
                <option value="">선택 안 함 (null)</option>
                {allComplexes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.canonical_name}
                    {(c.si || c.gu) ? ` (${[c.si, c.gu].filter(Boolean).join(' ')})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn btn-sm btn-orange">
              상태 변경
            </button>
          </form>
        </div>

        {/* 입력 폼 */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <h2 style={{ font: '700 16px/1.4 var(--font-sans)', margin: '0 0 16px' }}>
            단계 입력
          </h2>
          <form action={upsertRedevelopmentProjectFormAction} aria-label="재건축 단계 입력">
            {/* 단지 select */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="complex-select"
                style={{
                  font: '500 11px/1 var(--font-sans)',
                  color: 'var(--fg-sec)',
                  marginBottom: 6,
                  display: 'block',
                }}
              >
                단지
              </label>
              <select
                name="complexId"
                id="complex-select"
                className="input"
                required
                style={{ width: '100%' }}
              >
                <option value="">단지를 선택해 주세요</option>
                {complexList.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.canonical_name}
                    {(c.si || c.gu) ? ` (${[c.si, c.gu].filter(Boolean).join(' ')})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 진행 단계 select */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="phase-select"
                style={{
                  font: '500 11px/1 var(--font-sans)',
                  color: 'var(--fg-sec)',
                  marginBottom: 6,
                  display: 'block',
                }}
              >
                진행 단계
              </label>
              <select
                name="phase"
                id="phase-select"
                className="input"
                required
                style={{ width: '100%' }}
              >
                <option value="">단계 선택</option>
                {PHASE_OPTIONS.map(p => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 비고 */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="notes-textarea"
                style={{
                  font: '500 11px/1 var(--font-sans)',
                  color: 'var(--fg-sec)',
                  marginBottom: 6,
                  display: 'block',
                }}
              >
                비고 (선택)
              </label>
              <textarea
                name="notes"
                id="notes-textarea"
                rows={3}
                className="input"
                placeholder="추가 설명 (최대 500자)"
                maxLength={500}
                style={{ width: '100%', height: 'auto', padding: '10px 14px', resize: 'vertical' }}
              />
            </div>

            {/* 저장 버튼 + 피드백 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="submit" className="btn btn-sm btn-orange">
                저장
              </button>
              <div aria-live="polite">
                {saved === '1' && (
                  <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-positive)' }}>
                    저장되었습니다.
                  </span>
                )}
                {formError && (
                  <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-negative)' }}>
                    {decodeURIComponent(formError)}
                  </span>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* 재건축 단지 목록 */}
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
            등록된 재건축 단지가 없습니다.
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--line-default)',
                      background: 'var(--bg-surface-2)',
                    }}
                  >
                    {['단지명', '지역', '진행 단계', '최종 수정', '비고'].map(h => (
                      <th
                        key={h}
                        scope="col"
                        style={{
                          padding: '10px 16px',
                          font: '500 11px/1 var(--font-sans)',
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
                  {rows.map((r, i) => {
                    const matchedComplex = complexList.find(c => c.id === r.complex_id)
                    const phaseLabel = PHASE_LABEL_MAP[r.phase] ?? r.phase
                    const phaseBadgeClass =
                      r.phase === 'completed'
                        ? 'badge pos'
                        : r.phase === 'cancelled'
                          ? 'badge neg'
                          : 'badge neutral'

                    return (
                      <tr
                        key={r.id}
                        style={{
                          borderBottom: i < rows.length - 1 ? '1px solid var(--line-subtle)' : 'none',
                        }}
                      >
                        <td
                          style={{
                            padding: '12px 16px',
                            font: '500 13px/1.4 var(--font-sans)',
                            color: 'var(--fg-pri)',
                          }}
                        >
                          {matchedComplex?.canonical_name ?? r.project_name}
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            font: '500 12px/1 var(--font-sans)',
                            color: 'var(--fg-sec)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {matchedComplex
                            ? [matchedComplex.si, matchedComplex.gu].filter(Boolean).join(' ')
                            : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className={phaseBadgeClass}>{phaseLabel}</span>
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            font: '500 12px/1 var(--font-sans)',
                            color: 'var(--fg-tertiary)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatDateTime(r.updated_at)}
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            font: '500 13px/1.4 var(--font-sans)',
                            color: 'var(--fg-sec)',
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={r.notes ?? undefined}
                        >
                          {r.notes ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
  )
}
