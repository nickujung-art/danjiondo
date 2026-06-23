import type { Metadata } from 'next'
import Link from 'next/link'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import { getGapRankings } from '@/lib/data/gap-analysis'
import type { GapRankingRow } from '@/lib/data/gap-analysis'
import { complexHref } from '@/lib/format'

export const revalidate = 3600

export const metadata: Metadata = {
  title: '갭투자 분석 — 창원·김해 | 단지온도',
  description:
    '창원·김해 아파트 단지별 갭 비율·갭 금액·전세가율 랭킹. 매매-전세 갭투자 위험도를 확인하세요.',
}

interface Props {
  searchParams: Promise<{ sgg_code?: string; risk_level?: string }>
}

// ─── allowlists ──────────────────────────────────────────────────────────────
const ALLOWED_SGG_CODES = ['48121', '48123', '48125', '48127', '48129', '48250']
const ALLOWED_RISK_LEVELS = ['safe', 'caution', 'danger'] as const
type AllowedRiskLevel = (typeof ALLOWED_RISK_LEVELS)[number]

// ─── constants ───────────────────────────────────────────────────────────────
const SGG_LABEL: Record<string, string> = {
  '48121': '창원 의창구',
  '48123': '창원 성산구',
  '48125': '창원 마산합포구',
  '48127': '창원 마산회원구',
  '48129': '창원 진해구',
  '48250': '김해시',
}

const REGION_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '전체', value: '' },
  ...ALLOWED_SGG_CODES.map((code) => ({ label: SGG_LABEL[code] ?? code, value: code })),
]

const RISK_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '전체', value: '' },
  { label: '안전', value: 'safe' },
  { label: '주의', value: 'caution' },
  { label: '위험', value: 'danger' },
]

const RISK_BADGE: Record<AllowedRiskLevel, { bg: string; label: string }> = {
  safe:    { bg: '#16a34a', label: '안전' },
  caution: { bg: '#d97706', label: '주의' },
  danger:  { bg: '#dc2626', label: '위험' },
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function formatPrice(price: number): string {
  const uk  = Math.floor(price / 10000)
  const man = price % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}만`
  if (uk > 0) return `${uk}억`
  return `${price.toLocaleString()}만`
}

function filterTab(
  key: string,
  value: string,
  currentSgg: string | undefined,
  currentRisk: string | undefined,
): string {
  const p = new URLSearchParams()
  if (key !== 'sgg_code' && currentSgg)  p.set('sgg_code',   currentSgg)
  if (key !== 'risk_level' && currentRisk) p.set('risk_level', currentRisk)
  if (value) p.set(key, value)
  const s = p.toString()
  return `/gap-analysis${s ? `?${s}` : ''}`
}

// ─── component ───────────────────────────────────────────────────────────────
export default async function GapAnalysisPage({ searchParams }: Props) {
  const params    = await searchParams
  const rawSgg    = typeof params.sgg_code   === 'string' ? params.sgg_code   : ''
  const rawRisk   = typeof params.risk_level === 'string' ? params.risk_level : ''
  const sggCode   = ALLOWED_SGG_CODES.includes(rawSgg)    ? rawSgg  : undefined
  const riskLevel = (ALLOWED_RISK_LEVELS as ReadonlyArray<string>).includes(rawRisk)
    ? (rawRisk as AllowedRiskLevel)
    : undefined

  const supabase = createReadonlyClient()
  const rows: GapRankingRow[] = await getGapRankings(
    { sggCode, riskLevel },
    supabase,
  ).catch(() => [])

  // ─── tab active helpers ──────────────────────────────────────────────────
  function isSggActive(value: string): boolean {
    return value === '' ? !sggCode : sggCode === value
  }
  function isRiskActive(value: string): boolean {
    return value === '' ? !riskLevel : riskLevel === value
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display:        'inline-flex',
    alignItems:     'center',
    padding:        '0 12px',
    minHeight:      44,
    borderRadius:   6,
    font:           '500 12px/1 var(--font-sans)',
    textDecoration: 'none',
    background:     active ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
    color:          active ? '#fff' : 'var(--fg-sec)',
    border:         '1px solid var(--line-subtle)',
    whiteSpace:     'nowrap' as const,
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>
      {/* Header */}
      <header
        style={{
          height:       60,
          background:   '#fff',
          borderBottom: '1px solid var(--line-default)',
          display:      'flex',
          alignItems:   'center',
          padding:      '0 16px',
          gap:          16,
          position:     'sticky',
          top:          0,
          zIndex:       50,
        }}
      >
        <Link href="/" className="dj-logo">
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
        <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
          갭투자 분석
        </span>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 16px' }}>
        {/* Page title */}
        <div style={{ marginBottom: 20 }}>
          <h1
            style={{
              font:          '700 22px/1.3 var(--font-sans)',
              letterSpacing: '-0.02em',
              margin:        '0 0 6px',
            }}
          >
            갭투자 분석
          </h1>
          <p
            style={{
              font:   '500 13px/1.5 var(--font-sans)',
              color:  'var(--fg-tertiary)',
              margin: 0,
            }}
          >
            창원·김해 아파트 단지별 갭 비율 랭킹 — 최근 12개월 거래 중위값 기준
          </p>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {/* 지역 필터 */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {REGION_OPTIONS.map((opt) => (
              <Link
                key={`sgg-${opt.value}`}
                href={filterTab('sgg_code', opt.value, sggCode, riskLevel)}
                style={tabStyle(isSggActive(opt.value))}
              >
                {opt.label}
              </Link>
            ))}
          </div>

          {/* 위험도 필터 */}
          <div style={{ display: 'flex', gap: 4 }}>
            {RISK_OPTIONS.map((opt) => (
              <Link
                key={`risk-${opt.value}`}
                href={filterTab('risk_level', opt.value, sggCode, riskLevel)}
                style={tabStyle(isRiskActive(opt.value))}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Result count */}
        <p
          style={{
            font:         '500 12px/1 var(--font-sans)',
            color:        'var(--fg-tertiary)',
            marginBottom: 12,
          }}
        >
          {rows.length}개 단지
        </p>

        {/* Table or empty state */}
        {rows.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <p
              style={{
                font:   '500 14px/1.6 var(--font-sans)',
                color:  'var(--fg-tertiary)',
                margin: 0,
              }}
            >
              갭투자 통계 데이터가 아직 없습니다.
            </p>
            <p
              style={{
                font:   '400 12px/1.5 var(--font-sans)',
                color:  'var(--fg-tertiary)',
                margin: '8px 0 0',
              }}
            >
              일배치 cron이 실행된 후 데이터가 표시됩니다.
            </p>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 580, borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    background:   'var(--bg-surface-2)',
                    borderBottom: '1px solid var(--line-default)',
                  }}
                >
                  {['#', '단지명', '갭 비율', '갭 금액', '전세가율', '위험도', '매매 건수'].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding:     '10px 12px',
                          font:        '600 11px/1 var(--font-sans)',
                          color:       'var(--fg-sec)',
                          textAlign:   h === '#' || h === '매매 건수' ? 'center' : 'left',
                          whiteSpace:  'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const badge = RISK_BADGE[row.riskLevel] ?? RISK_BADGE['caution']
                  const ratioColor =
                    row.riskLevel === 'danger'
                      ? '#dc2626'
                      : row.riskLevel === 'caution'
                        ? '#d97706'
                        : '#16a34a'

                  return (
                    <tr
                      key={row.complexId}
                      style={{ borderBottom: '1px solid var(--line-subtle)' }}
                    >
                      {/* # */}
                      <td
                        style={{
                          padding:   '10px 12px',
                          font:      '500 12px/1 var(--font-sans)',
                          color:     'var(--fg-tertiary)',
                          textAlign: 'center',
                          width:     36,
                        }}
                      >
                        {idx + 1}
                      </td>

                      {/* 단지명 */}
                      <td style={{ padding: '10px 12px' }}>
                        <Link
                          href={complexHref(row.complexId, row.status === 'active' ? row.urlSlug : null)}
                          style={{
                            font:           '600 13px/1.3 var(--font-sans)',
                            color:          'var(--fg-pri)',
                            textDecoration: 'none',
                          }}
                        >
                          {row.complexName}
                        </Link>
                        {(row.si ?? row.gu) && (
                          <div
                            style={{
                              font:      '400 11px/1 var(--font-sans)',
                              color:     'var(--fg-tertiary)',
                              marginTop: 2,
                            }}
                          >
                            {[row.si, row.gu].filter(Boolean).join(' ')}
                          </div>
                        )}
                      </td>

                      {/* 갭 비율 */}
                      <td
                        className="tnum"
                        style={{
                          padding: '10px 12px',
                          font:    '700 14px/1 var(--font-sans)',
                          color:   ratioColor,
                        }}
                      >
                        {row.gapRatio.toFixed(1)}%
                      </td>

                      {/* 갭 금액 */}
                      <td
                        className="tnum"
                        style={{ padding: '10px 12px', font: '500 13px/1 var(--font-sans)' }}
                      >
                        {formatPrice(row.gapAmount)}
                      </td>

                      {/* 전세가율 */}
                      <td
                        className="tnum"
                        style={{
                          padding: '10px 12px',
                          font:    '500 13px/1 var(--font-sans)',
                          color:   'var(--fg-sec)',
                        }}
                      >
                        {row.jeonseRatio.toFixed(1)}%
                      </td>

                      {/* 위험도 */}
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            display:     'inline-flex',
                            alignItems:  'center',
                            background:  badge.bg,
                            color:       '#fff',
                            font:        '600 11px/1 var(--font-sans)',
                            borderRadius: 4,
                            padding:     '3px 8px',
                            whiteSpace:  'nowrap',
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* 매매 건수 */}
                      <td
                        className="tnum"
                        style={{
                          padding:   '10px 12px',
                          font:      '500 12px/1 var(--font-sans)',
                          color:     'var(--fg-tertiary)',
                          textAlign: 'center',
                        }}
                      >
                        {row.saleCount}건
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Data footnote */}
        <p
          style={{
            font:      '400 11px/1.5 var(--font-sans)',
            color:     'var(--fg-tertiary)',
            marginTop: 12,
          }}
        >
          국토부 실거래 기준 · 매매·전세 각 3건 이상 단지만 표시 · 매일 새벽 갱신
        </p>
      </main>
    </div>
  )
}
