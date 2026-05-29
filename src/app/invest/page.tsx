import type { Metadata } from 'next'
import Link from 'next/link'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import { getGapRankings } from '@/lib/data/gap-analysis'
import type { GapRankingRow } from '@/lib/data/gap-analysis'
import { getRegionalPriceHistory, ALLOWED_SGG_CODES, ALLOWED_AREA_BUCKETS } from '@/lib/data/invest'
import type { AreaBucket, RegionalPricePoint } from '@/lib/data/invest'
import { RegionalPriceChartWrapper } from '@/components/invest/RegionalPriceChartWrapper'
import { formatPrice } from '@/lib/format'

export const revalidate = 3600

export const metadata: Metadata = {
  title: '투자 분석 — 창원·김해 | 단지온도',
  description:
    '창원·김해 아파트 지역별 시세 흐름 + 갭투자 위험도 랭킹. 실거래 데이터 기반 참고 지수.',
}

interface Props {
  searchParams: Promise<{ sgg_code?: string; risk_level?: string; area_type?: string }>
}

// ─── allowlists ──────────────────────────────────────────────────────────────
// ALLOWED_SGG_CODES, ALLOWED_AREA_BUCKETS는 @/lib/data/invest에서 import
const ALLOWED_RISK_LEVELS = ['safe', 'caution', 'danger'] as const
type AllowedRiskLevel = (typeof ALLOWED_RISK_LEVELS)[number]

// ─── constants ───────────────────────────────────────────────────────────────
const SGG_LABEL: Record<string, string> = {
  '48121': '창원 의창구',
  '48123': '창원 창원구',
  '48125': '창원 성산구',
  '48127': '창원 마산합포구',
  '48128': '창원 마산회원구',
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

// D-03/D-09: 타입 탭은 정확히 3개 (전체 | 59㎡ | 84㎡)
// 입력 검증은 ALLOWED_AREA_BUCKETS (4값) 사용 — 탭 표시와 별개
const AREA_OPTIONS = [
  { label: '전체', value: '' },
  { label: '59㎡', value: '59' },
  { label: '84㎡', value: '84' },
] as const

const RISK_BADGE: Record<AllowedRiskLevel, { bg: string; label: string }> = {
  safe:    { bg: '#16a34a', label: '안전' },
  caution: { bg: '#d97706', label: '주의' },
  danger:  { bg: '#dc2626', label: '위험' },
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function filterTab(
  key: string,
  value: string,
  currentSgg:  string | undefined,
  currentRisk: string | undefined,
  currentArea: string | undefined,
): string {
  const p = new URLSearchParams()
  if (key !== 'sgg_code'   && currentSgg)  p.set('sgg_code',   currentSgg)
  if (key !== 'risk_level' && currentRisk) p.set('risk_level', currentRisk)
  if (key !== 'area_type'  && currentArea) p.set('area_type',  currentArea)
  if (value) p.set(key, value)
  const s = p.toString()
  return `/invest${s ? `?${s}` : ''}`
}

// ─── component ───────────────────────────────────────────────────────────────
export default async function InvestPage({ searchParams }: Props) {
  const params    = await searchParams
  const rawSgg    = typeof params.sgg_code   === 'string' ? params.sgg_code   : ''
  const rawRisk   = typeof params.risk_level === 'string' ? params.risk_level : ''
  const rawArea   = typeof params.area_type  === 'string' ? params.area_type  : ''

  const sggCode   = (ALLOWED_SGG_CODES as ReadonlyArray<string>).includes(rawSgg)
    ? rawSgg
    : undefined
  const riskLevel = (ALLOWED_RISK_LEVELS as ReadonlyArray<string>).includes(rawRisk)
    ? (rawRisk as AllowedRiskLevel)
    : undefined
  // 입력 검증은 ALLOWED_AREA_BUCKETS (4값) — 탭 표시(AREA_OPTIONS 3개)와 별개
  const areaBucket = (ALLOWED_AREA_BUCKETS as ReadonlyArray<string>).includes(rawArea)
    ? (rawArea as AreaBucket)
    : undefined

  const supabase = createReadonlyClient()

  // 병렬 fetch
  const [priceHistory, rows] = await Promise.all([
    getRegionalPriceHistory(supabase, sggCode, areaBucket, 24).catch((): RegionalPricePoint[] => []),
    getGapRankings({ sggCode, riskLevel }, supabase).catch((): GapRankingRow[] => []),
  ])

  // ─── tab active helpers ───────────────────────────────────────────────────
  function isSggActive(value: string): boolean {
    return value === '' ? !sggCode : sggCode === value
  }
  function isRiskActive(value: string): boolean {
    return value === '' ? !riskLevel : riskLevel === value
  }
  function isAreaActive(value: string): boolean {
    return value === '' ? !areaBucket : areaBucket === value
  }

  // 차트 제목
  const regionLabel = sggCode ? (SGG_LABEL[sggCode] ?? sggCode) : '창원·김해 전체'
  const areaLabel   = areaBucket
    ? areaBucket === '59' ? '59㎡' : areaBucket === '84' ? '84㎡' : areaBucket
    : '전체 타입'
  const chartTitle  = `${regionLabel} ${areaLabel} 아파트 매매 시세 흐름 (최근 24개월)`

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display:        'inline-block',
    padding:        '5px 12px',
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
          padding:      '0 32px',
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
          투자 분석
        </span>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 32px' }}>
        {/* Page title */}
        <div style={{ marginBottom: 20 }}>
          <h1
            style={{
              font:          '700 22px/1.3 var(--font-sans)',
              letterSpacing: '-0.02em',
              margin:        '0 0 6px',
            }}
          >
            투자 분석
          </h1>
          <p
            style={{
              font:   '500 13px/1.5 var(--font-sans)',
              color:  'var(--fg-tertiary)',
              margin: 0,
            }}
          >
            실거래 흐름 기반 참고 지수 — 창원·김해 아파트 시세 흐름 + 갭투자 위험도
          </p>
        </div>

        {/* ─── 지역 필터 탭 ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {REGION_OPTIONS.map((opt) => (
            <Link
              key={`sgg-${opt.value}`}
              href={filterTab('sgg_code', opt.value, sggCode, riskLevel, areaBucket)}
              style={tabStyle(isSggActive(opt.value))}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        {/* ─── 시세 흐름 차트 섹션 ───────────────────────────────────────────── */}
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              marginBottom:   12,
              flexWrap:       'wrap',
              gap:            8,
            }}
          >
            <h2 style={{ font: '700 15px/1.4 var(--font-sans)', margin: 0 }}>시세 흐름</h2>
            {/* 타입 탭 — D-03/D-09: 전체|59㎡|84㎡ 정확히 3개 고정 */}
            <div style={{ display: 'flex', gap: 4 }}>
              {AREA_OPTIONS.map((opt) => (
                <Link
                  key={`area-${opt.value}`}
                  href={filterTab('area_type', opt.value, sggCode, riskLevel, areaBucket)}
                  style={tabStyle(isAreaActive(opt.value))}
                >
                  {opt.label}
                </Link>
              ))}
            </div>
          </div>

          <RegionalPriceChartWrapper data={priceHistory} title={chartTitle} />

          {/* 법적 면책 문구 (D-01) */}
          <p
            style={{
              font:   '400 11px/1.5 var(--font-sans)',
              color:  'var(--fg-tertiary)',
              margin: '12px 0 0',
            }}
          >
            * 본 데이터는 국토교통부 실거래가 공개시스템 기반입니다.<br />
            * 투자 결정에 직접 활용하지 마세요. 부동산 전문가와 상담하시기 바랍니다.
          </p>
        </div>

        {/* ─── 갭투자 랭킹 섹션 ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              font:          '700 18px/1.3 var(--font-sans)',
              letterSpacing: '-0.01em',
              margin:        '0 0 12px',
            }}
          >
            갭투자 랭킹
          </h2>
          {/* 위험도 필터 */}
          <div style={{ display: 'flex', gap: 4 }}>
            {RISK_OPTIONS.map((opt) => (
              <Link
                key={`risk-${opt.value}`}
                href={filterTab('risk_level', opt.value, sggCode, riskLevel, areaBucket)}
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
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                          padding:    '10px 12px',
                          font:       '600 11px/1 var(--font-sans)',
                          color:      'var(--fg-sec)',
                          textAlign:  h === '#' || h === '매매 건수' ? 'center' : 'left',
                          whiteSpace: 'nowrap',
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
                  const badge      = RISK_BADGE[row.riskLevel] ?? RISK_BADGE['caution']
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
                        {/* D-06: 단지 클릭 → /complexes/[id] (기존 상세 페이지) */}
                        <Link
                          href={`/complexes/${row.complexId}`}
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
                            display:      'inline-flex',
                            alignItems:   'center',
                            background:   badge.bg,
                            color:        '#fff',
                            font:         '600 11px/1 var(--font-sans)',
                            borderRadius: 4,
                            padding:      '3px 8px',
                            whiteSpace:   'nowrap',
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
