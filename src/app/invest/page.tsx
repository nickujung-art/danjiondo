import type { Metadata } from 'next'
import Link from 'next/link'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import { getGapRankings } from '@/lib/data/gap-analysis'
import type { GapRankingRow } from '@/lib/data/gap-analysis'
import {
  getTopPredictionComplexes,
  getRegionalPredictionSummary,
  ALLOWED_AREA_BUCKETS,
} from '@/lib/data/invest'
import type { AreaBucket } from '@/lib/data/invest'
import { getActiveSggCodes } from '@/lib/data/regions'
import { PredictionSection } from '@/components/invest/PredictionSection'
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
// ALLOWED_AREA_BUCKETS는 @/lib/data/invest에서 import, 지역 코드는 regions 테이블 동적 조회(getActiveSggCodes)로 대체됨
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
  '48170': '진주시', '48220': '통영시', '48240': '사천시', '48270': '밀양시',
  '48310': '거제시', '48330': '양산시', '48720': '의령군', '48730': '함안군',
  '48740': '창녕군', '48820': '고성군', '48840': '남해군', '48850': '하동군',
  '48860': '산청군', '48870': '함양군', '48880': '거창군', '48890': '합천군',
}

const RISK_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '전체', value: '' },
  { label: '안전', value: 'safe' },
  { label: '주의', value: 'caution' },
  { label: '위험', value: 'danger' },
]

// 예측 면적 탭: 전체 | 소형 | 59㎡ | 84㎡ | 대형
// 입력 검증은 ALLOWED_AREA_BUCKETS (4값) 사용 — 탭 표시와 별개
const AREA_OPTIONS = [
  { label: '전체',  value: '' },
  { label: '소형',  value: '소형' },
  { label: '59㎡',  value: '59' },
  { label: '84㎡',  value: '84' },
  { label: '대형',  value: '대형' },
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

// ─── tab className helper ─────────────────────────────────────────────────────
const TAB_BASE_CLASS =
  'inline-flex items-center px-3 rounded-[6px] text-xs font-medium whitespace-nowrap min-h-[44px]'

function tabStyle(active: boolean): React.CSSProperties {
  return {
    background:     active ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
    color:          active ? '#fff' : 'var(--fg-sec)',
    border:         '1px solid var(--line-subtle)',
    textDecoration: 'none',
  }
}

// ─── component ───────────────────────────────────────────────────────────────
export default async function InvestPage({ searchParams }: Props) {
  const params    = await searchParams
  const rawSgg    = typeof params.sgg_code   === 'string' ? params.sgg_code   : ''
  const rawRisk   = typeof params.risk_level === 'string' ? params.risk_level : ''
  const rawArea   = typeof params.area_type  === 'string' ? params.area_type  : ''

  const supabase = createReadonlyClient()
  const allowedSggCodes = await getActiveSggCodes(supabase)

  const sggCode   = allowedSggCodes.includes(rawSgg)
    ? rawSgg
    : undefined
  const riskLevel = (ALLOWED_RISK_LEVELS as ReadonlyArray<string>).includes(rawRisk)
    ? (rawRisk as AllowedRiskLevel)
    : undefined
  // 입력 검증은 ALLOWED_AREA_BUCKETS (4값) — 탭 표시(AREA_OPTIONS 3개)와 별개
  const areaBucket = (ALLOWED_AREA_BUCKETS as ReadonlyArray<string>).includes(rawArea)
    ? (rawArea as AreaBucket)
    : undefined

  const REGION_OPTIONS: Array<{ label: string; value: string }> = [
    { label: '전체', value: '' },
    ...allowedSggCodes.map((code) => ({ label: SGG_LABEL[code] ?? code, value: code })),
  ]

  // 병렬 fetch: 갭랭킹 + 예측 랭킹 + 지역 예측 요약
  const [rows, rankingItems, regionalSummaries] = await Promise.all([
    getGapRankings({ sggCode, riskLevel }, supabase).catch((): GapRankingRow[] => []),
    getTopPredictionComplexes(supabase, sggCode, areaBucket, 10).catch(() => []),
    getRegionalPredictionSummary(supabase, areaBucket).catch(() => []),
  ])

  // 예측 섹션 면적 탭 (전체 | 59㎡ | 84㎡)
  const areaTabItems = AREA_OPTIONS.map((opt) => ({
    label:  opt.label,
    href:   filterTab('area_type', opt.value, sggCode, riskLevel, areaBucket),
    active: opt.value === '' ? !areaBucket : areaBucket === opt.value,
  }))

  // ─── tab active helpers ───────────────────────────────────────────────────
  function isSggActive(value: string): boolean {
    return value === '' ? !sggCode : sggCode === value
  }
  function isRiskActive(value: string): boolean {
    return value === '' ? !riskLevel : riskLevel === value
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-canvas)' }}>
      <main className="px-4 py-6 sm:max-w-screen-lg sm:mx-auto">
        {/* Page title */}
        <div className="mb-5">
          <h1
            className="text-2xl font-bold tracking-tight mb-1.5"
            style={{ color: 'var(--fg-pri)' }}
          >
            투자 분석
          </h1>
          <p
            className="text-sm font-medium"
            style={{ color: 'var(--fg-tertiary)' }}
          >
            실거래 흐름 기반 참고 지수 — 창원·김해 아파트 시세 흐름 + 갭투자 위험도
          </p>
        </div>

        {/* ─── 지역 필터 탭 ──────────────────────────────────────────────────── */}
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4 mb-2">
          {REGION_OPTIONS.map((opt) => (
            <Link
              key={`sgg-${opt.value}`}
              href={filterTab('sgg_code', opt.value, sggCode, riskLevel, areaBucket)}
              className={TAB_BASE_CLASS}
              style={tabStyle(isSggActive(opt.value))}
            >
              {opt.label}
            </Link>
          ))}
        </div>

        {/* ─── 시세 예측 분석 섹션 ─────────────────────────────────────────── */}
        <PredictionSection
          regionalSummaries={regionalSummaries}
          rankingItems={rankingItems}
          areaTabItems={areaTabItems}
          activeBucket={areaBucket}
        />

        {/* ─── 갭투자 랭킹 섹션 ──────────────────────────────────────────────── */}
        <div className="mb-4">
          <h2
            className="text-lg font-bold tracking-tight mb-3"
            style={{ color: 'var(--fg-pri)' }}
          >
            갭투자 랭킹
          </h2>
          {/* 위험도 필터 */}
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4">
            {RISK_OPTIONS.map((opt) => (
              <Link
                key={`risk-${opt.value}`}
                href={filterTab('risk_level', opt.value, sggCode, riskLevel, areaBucket)}
                className={TAB_BASE_CLASS}
                style={tabStyle(isRiskActive(opt.value))}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Result count */}
        <p
          className="text-xs font-medium mb-3"
          style={{ color: 'var(--fg-tertiary)' }}
        >
          {rows.length}개 단지
        </p>

        {/* Table or empty state */}
        {rows.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ font: '500 14px/1.6 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
              갭투자 통계 데이터가 아직 없습니다.
            </p>
            <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '8px 0 0' }}>
              일배치 cron이 실행된 후 데이터가 표시됩니다.
            </p>
          </div>
        ) : (
          <>
            {/* 모바일: 카드 리스트 */}
            <div className="sm:hidden" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((row, idx) => {
                const badge      = RISK_BADGE[row.riskLevel] ?? RISK_BADGE['caution']
                const ratioColor = row.riskLevel === 'danger' ? '#dc2626' : row.riskLevel === 'caution' ? '#d97706' : '#16a34a'
                return (
                  <Link
                    key={row.complexId}
                    href={`/complexes/${row.complexId}`}
                    className="card"
                    style={{ display: 'block', padding: '14px 16px', textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>#{idx + 1}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: badge.bg, color: '#fff', font: '600 11px/1 var(--font-sans)', borderRadius: 4, padding: '3px 8px' }}>
                          {badge.label}
                        </span>
                      </div>
                      <span className="tnum" style={{ font: '700 22px/1 var(--font-sans)', color: ratioColor }}>
                        {row.gapRatio.toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ font: '600 14px/1.3 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 2 }}>
                      {row.complexName}
                    </div>
                    {(row.si ?? row.gu) && (
                      <div style={{ font: '400 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 10 }}>
                        {[row.si, row.gu].filter(Boolean).join(' ')}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', paddingTop: 10, borderTop: '1px solid var(--line-subtle)' }}>
                      {[
                        { label: '갭 금액',  value: formatPrice(row.gapAmount) },
                        { label: '전세가율', value: `${row.jeonseRatio.toFixed(1)}%` },
                        { label: '매매 건수', value: `${row.saleCount}건` },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                          <div style={{ font: '400 10px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', marginBottom: 2 }}>{label}</div>
                          <div className="tnum" style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </Link>
                )
              })}
            </div>

            {/* 데스크탑: 테이블 */}
            <div className="hidden sm:block card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 580, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--line-default)' }}>
                      {['#', '단지명', '갭 비율', '갭 금액', '전세가율', '위험도', '매매 건수'].map((h) => (
                        <th key={h} style={{ padding: '10px 12px', font: '600 11px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: h === '#' || h === '매매 건수' ? 'center' : 'left', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const badge      = RISK_BADGE[row.riskLevel] ?? RISK_BADGE['caution']
                      const ratioColor = row.riskLevel === 'danger' ? '#dc2626' : row.riskLevel === 'caution' ? '#d97706' : '#16a34a'
                      return (
                        <tr key={row.complexId} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                          <td style={{ padding: '10px 12px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', textAlign: 'center', width: 36 }}>{idx + 1}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <Link href={`/complexes/${row.complexId}`} style={{ font: '600 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none' }}>
                              {row.complexName}
                            </Link>
                            {(row.si ?? row.gu) && (
                              <div style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 2 }}>
                                {[row.si, row.gu].filter(Boolean).join(' ')}
                              </div>
                            )}
                          </td>
                          <td className="tnum" style={{ padding: '10px 12px', font: '700 14px/1 var(--font-sans)', color: ratioColor }}>{row.gapRatio.toFixed(1)}%</td>
                          <td className="tnum" style={{ padding: '10px 12px', font: '500 13px/1 var(--font-sans)' }}>{formatPrice(row.gapAmount)}</td>
                          <td className="tnum" style={{ padding: '10px 12px', font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>{row.jeonseRatio.toFixed(1)}%</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', background: badge.bg, color: '#fff', font: '600 11px/1 var(--font-sans)', borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="tnum" style={{ padding: '10px 12px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', textAlign: 'center' }}>{row.saleCount}건</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Data footnote */}
        <p
          className="text-xs mt-3"
          style={{ color: 'var(--fg-tertiary)', lineHeight: 1.5 }}
        >
          국토부 실거래 기준 · 매매·전세 각 3건 이상 단지만 표시 · 매일 새벽 갱신
        </p>
      </main>
    </div>
  )
}
