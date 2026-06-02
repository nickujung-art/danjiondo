import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import {
  getRegionalPriceHistory,
  getRegionalPredictionTimeseries,
  getRegionalJeonseRatio,
  getTopPredictionComplexes,
  getRegionalUnsold,
  getLatestRegionalIncome,
  getMortgageRate,
  getRegionalPopulation,
  calcHAI,
  ALLOWED_SGG_CODES,
  ALLOWED_AREA_BUCKETS,
  type AreaBucket,
  type PredictionPoint,
  type RegionalUnsoldPoint,
} from '@/lib/data/invest'
import { RegionalPriceChartWrapper } from '@/components/invest/RegionalPriceChartWrapper'
import { formatPrice } from '@/lib/format'
import { getRegionalCommentary } from '@/lib/ai/regional-commentary'

export const revalidate = 3600

const SGG_LABEL: Record<string, string> = {
  '48121': '창원 의창구',
  '48123': '창원 창원구',
  '48125': '창원 성산구',
  '48127': '창원 마산합포구',
  '48128': '창원 마산회원구',
  '48129': '창원 진해구',
  '48250': '김해시',
}

interface Props {
  params: Promise<{ sggCode: string }>
  searchParams: Promise<{ area_bucket?: string; horizon?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sggCode } = await params
  const label = SGG_LABEL[sggCode] ?? sggCode
  return {
    title: `${label} 시세 예측 — 단지온도`,
    description: `${label} 아파트 AI 시세 예측 분석. 과거 거래 기반 6개월 예측.`,
  }
}

const AREA_OPTIONS = [
  { label: '전체',  value: '' },
  { label: '소형',  value: '소형' },
  { label: '59㎡',  value: '59' },
  { label: '74㎡',  value: '74' },
  { label: '84㎡',  value: '84' },
  { label: '대형',  value: '대형' },
] as const

const HORIZON_OPTIONS = [
  { label: '3개월', value: '3' },
  { label: '6개월', value: '6' },
  { label: '1년',   value: '12' },
] as const

const DIRECTION_COLOR: Record<'up' | 'flat' | 'down', string> = {
  up: '#16a34a', flat: '#d97706', down: '#dc2626',
}
const DIRECTION_ARROW: Record<'up' | 'flat' | 'down', string> = {
  up: '↑', flat: '→', down: '↓',
}

function directionOf(pct: number): 'up' | 'flat' | 'down' {
  if (pct > 3) return 'up'
  if (pct < -3) return 'down'
  return 'flat'
}

function fmtPct(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function confidenceBadge(mape: number): { label: string; color: string } {
  if (mape < 0.10) return { label: '높음', color: '#16a34a' }
  if (mape < 0.20) return { label: '보통', color: '#d97706' }
  return { label: '낮음', color: '#dc2626' }
}

type RiskGrade = 'good' | 'caution' | 'bad' | 'na'
interface RiskItem {
  label: string
  grade: RiskGrade
  value: string
  desc: string
}

const RISK_COLOR: Record<RiskGrade, string> = {
  good:   '#16a34a',
  caution:'#d97706',
  bad:    '#dc2626',
  na:     'var(--fg-tertiary)',
}
const RISK_LABEL: Record<RiskGrade, string> = {
  good: '양호', caution: '주의', bad: '위험', na: '—',
}

function buildRiskItems(opts: {
  changePct:   number | null
  jeonseRatio: number | null
  txCount:     number | null
  unsoldCount: number | null
}): RiskItem[] {
  const { changePct, jeonseRatio, txCount, unsoldCount } = opts

  const priceGrade: RiskGrade =
    changePct == null ? 'na'
    : changePct > 3   ? 'good'
    : changePct > -3  ? 'caution'
    : 'bad'

  const jeonseGrade: RiskGrade =
    jeonseRatio == null  ? 'na'
    : jeonseRatio < 70   ? 'good'
    : jeonseRatio < 80   ? 'caution'
    : 'bad'

  const unsoldGrade: RiskGrade =
    unsoldCount == null  ? 'na'
    : unsoldCount < 100  ? 'good'
    : unsoldCount < 500  ? 'caution'
    : 'bad'

  const txGrade: RiskGrade =
    txCount == null  ? 'na'
    : txCount >= 50  ? 'good'
    : txCount >= 20  ? 'caution'
    : 'bad'

  return [
    {
      label: '가격 방향성',
      grade: priceGrade,
      value: changePct != null ? fmtPct(changePct) : '—',
      desc:  'AI 예측 기준 단기 방향',
    },
    {
      label: '전세 리스크',
      grade: jeonseGrade,
      value: jeonseRatio != null ? `${jeonseRatio.toFixed(1)}%` : '—',
      desc:  '전세가율 높을수록 갭투자 리스크',
    },
    {
      label: '공급 과잉',
      grade: unsoldGrade,
      value: unsoldCount != null ? `${unsoldCount.toLocaleString('ko-KR')}세대` : '—',
      desc:  '미분양 적을수록 수요 우세',
    },
    {
      label: '거래 유동성',
      grade: txGrade,
      value: txCount != null ? `${txCount}건/월` : '—',
      desc:  '최근 거래량, 낮으면 매도 어려움',
    },
  ]
}

export default async function RegionDetailPage({ params, searchParams }: Props) {
  const { sggCode } = await params
  const sp = await searchParams
  const rawBucket = typeof sp.area_bucket === 'string' ? sp.area_bucket : ''
  const horizon = sp.horizon === '3' ? 3 : sp.horizon === '12' ? 12 : 6

  if (!(ALLOWED_SGG_CODES as ReadonlyArray<string>).includes(sggCode)) notFound()

  const areaBucket = (ALLOWED_AREA_BUCKETS as ReadonlyArray<string>).includes(rawBucket)
    ? (rawBucket as AreaBucket)
    : undefined

  const supabase = createReadonlyClient()
  const label = SGG_LABEL[sggCode] ?? sggCode

  const [history, predTimeseries, jeonseData, complexRanking, unsoldHistory, incomeData, mortgageRateData, populationData] = await Promise.all([
    getRegionalPriceHistory(supabase, sggCode, areaBucket, 36).catch(() => []),
    getRegionalPredictionTimeseries(supabase, sggCode, areaBucket).catch(() => []),
    getRegionalJeonseRatio(supabase, sggCode, areaBucket, 24).catch(() => []),
    getTopPredictionComplexes(supabase, sggCode, areaBucket, 10).catch(() => []),
    getRegionalUnsold(supabase, sggCode).catch(() => [] as RegionalUnsoldPoint[]),
    getLatestRegionalIncome(supabase).catch(() => null),
    getMortgageRate().catch(() => null),
    getRegionalPopulation(sggCode, 10).catch(() => []),
  ])

  // 미래 예측 포인트만 필터링 (Chronos는 backtesting 결과도 저장하므로 현재 달 이후만 사용)
  const currentYearMonth = new Date().toISOString().slice(0, 7)  // 'YYYY-MM'
  const futurePredTimeseries = predTimeseries.filter(p => p.predictedMonth > currentYearMonth)

  const rawPredPoints: PredictionPoint[] = futurePredTimeseries.map(p => ({
    yearMonth:    p.predictedMonth,
    mean:         p.medianPrice,
    lower:        p.lowerPrice,
    upper:        p.upperPrice,
    modelName:    'chronos-bolt-small',
    trainingMape: 0,
  }))

  // 예측선을 역사 데이터 마지막 가격에 연결 (단지 표본 편차 보정)
  const predictionPoints: PredictionPoint[] = (() => {
    if (rawPredPoints.length === 0 || history.length === 0) return rawPredPoints
    const lastHistPrice = history[history.length - 1]!.avgPrice
    const firstPredMean = rawPredPoints[0]!.mean
    if (firstPredMean <= 0) return rawPredPoints
    const scale = lastHistPrice / firstPredMean
    // 차이가 10% 이상일 때만 보정 (정상 범위는 그대로 표시)
    if (Math.abs(scale - 1) < 0.1) return rawPredPoints
    return rawPredPoints.map(p => ({
      ...p,
      mean:  Math.round(p.mean  * scale),
      lower: Math.round(p.lower * scale),
      upper: Math.round(p.upper * scale),
    }))
  })().slice(0, horizon)

  const latestUnsold  = unsoldHistory.length > 0 ? unsoldHistory[unsoldHistory.length - 1] : null
  const prevUnsold    = unsoldHistory.length > 1 ? unsoldHistory[unsoldHistory.length - 2] : null
  const unsoldChange  = latestUnsold && prevUnsold ? latestUnsold.unsoldCount - prevUnsold.unsoldCount : null

  const latestJeonse = [...jeonseData].reverse().find(j => j.jeonseRatio != null)
  const latestHistory = history[history.length - 1]

  // changePct: 미래 예측 기준 (horizon 기간 내 첫→마지막)
  let changePct: number | null = null
  if (predictionPoints.length >= 2) {
    const first = predictionPoints[0]!.mean
    const last  = predictionPoints[predictionPoints.length - 1]!.mean
    changePct = first > 0 ? ((last - first) / first) * 100 : null
  } else if (predictionPoints.length === 1) {
    // 예측 1개: 실거래 마지막 vs 예측 첫 달
    const lastReal = history[history.length - 1]?.avgPrice
    const predFirst = predictionPoints[0]!.mean
    changePct = lastReal && lastReal > 0 ? ((predFirst - lastReal) / lastReal) * 100 : null
  }
  const direction = changePct != null ? directionOf(changePct) : null

  // PIR: 최근 6개월 평균 매매가 ÷ 연간 가구소득 (단위 통일: 만원)
  const recentAvgPrice = history.length > 0
    ? history.slice(-6).reduce((s, r) => s + r.avgPrice, 0) / Math.min(history.slice(-6).length, 6)
    : null
  const recentJeonseAvg = jeonseData.length > 0
    ? [...jeonseData].reverse().find(j => j.rentAvg != null)?.rentAvg ?? null
    : null

  const annualIncome   = incomeData?.avgIncome ?? null  // 만원
  const mortgageRate   = mortgageRateData?.rate ?? null  // 연%
  const pir  = recentAvgPrice && annualIncome ? recentAvgPrice / annualIncome : null
  const jhai = recentJeonseAvg && annualIncome ? recentJeonseAvg / annualIncome : null
  const hai  = recentAvgPrice && annualIncome && mortgageRate
    ? calcHAI({ avgPrice: recentAvgPrice, annualIncome, mortgageRate })
    : null

  // 인구 추이
  const latestPop   = populationData.length > 0 ? populationData[populationData.length - 1] : null
  const prevPop     = populationData.length > 1 ? populationData[populationData.length - 2] : null
  const pop5yAgo    = populationData.length >= 5 ? populationData[populationData.length - 5] : null
  const popYoyChange   = latestPop && prevPop ? latestPop.population - prevPop.population : null
  const pop5yChangePct = latestPop && pop5yAgo && pop5yAgo.population > 0
    ? ((latestPop.population - pop5yAgo.population) / pop5yAgo.population) * 100
    : null

  const riskItems = buildRiskItems({
    changePct,
    jeonseRatio: latestJeonse?.jeonseRatio ?? null,
    txCount:     latestHistory?.txCount ?? null,
    unsoldCount: latestUnsold?.unsoldCount ?? null,
  })

  const aiCommentary = await getRegionalCommentary(sggCode, {
    label,
    areaBucket,
    changePct,
    direction,
    jeonseRatio: latestJeonse?.jeonseRatio ?? null,
    txCount: latestHistory?.txCount ?? null,
    unsoldCount: latestUnsold?.unsoldCount ?? null,
    horizon,
    pir,
    hai,
    mortgageRate,
  }).catch(() => null)

  function tabHref(bucket: string): string {
    const p = new URLSearchParams()
    if (bucket) p.set('area_bucket', bucket)
    if (horizon !== 6) p.set('horizon', String(horizon))
    const s = p.toString()
    return `/invest/region/${sggCode}${s ? `?${s}` : ''}`
  }

  function horizonHref(h: string): string {
    const p = new URLSearchParams()
    if (areaBucket) p.set('area_bucket', areaBucket)
    if (h !== '6') p.set('horizon', h)
    const s = p.toString()
    return `/invest/region/${sggCode}${s ? `?${s}` : ''}`
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-block', padding: '5px 12px', borderRadius: 6,
    font: '500 12px/1 var(--font-sans)', textDecoration: 'none',
    background: active ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
    color: active ? '#fff' : 'var(--fg-sec)',
    border: '1px solid var(--line-subtle)', whiteSpace: 'nowrap' as const,
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>
      <header style={{
        height: 60, background: '#fff', borderBottom: '1px solid var(--line-default)',
        display: 'flex', alignItems: 'center', padding: '0 32px', gap: 16,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <Link href="/" className="dj-logo">
          <span className="mark">단</span><span>단지온도</span>
        </Link>
        <Link href="/invest" style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-tertiary)', textDecoration: 'none' }}>
          투자 분석
        </Link>
        <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>›</span>
        <span style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>{label}</span>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 32px' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: '0 0 6px' }}>
            {label} 시세 예측 분석
          </h1>
          <p style={{ font: '500 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
            <span style={{
              display: 'inline-block', padding: '1px 6px', borderRadius: 4,
              background: 'var(--bg-surface-2)', border: '1px solid var(--line-subtle)',
              font: '600 11px/1.6 var(--font-sans)', color: 'var(--fg-sec)', marginRight: 6,
            }}>Chronos-Bolt-Small</span>
            Amazon 오픈소스 AI · 과거 실거래 기반 {horizon}개월 예측 · 참고용
          </p>
        </div>

        {/* 면적 탭 + 예측 기간 토글 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {AREA_OPTIONS.map(opt => (
              <Link key={opt.value} href={tabHref(opt.value)}
                style={tabStyle(opt.value === '' ? !areaBucket : areaBucket === opt.value)}>
                {opt.label}
              </Link>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginRight: 4 }}>예측 기간</span>
            {HORIZON_OPTIONS.map(opt => (
              <Link key={opt.value} href={horizonHref(opt.value)}
                style={tabStyle(String(horizon) === opt.value)}>
                {opt.label}
              </Link>
            ))}
          </div>
        </div>

        {/* 핵심 지표 카드 4개 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 24 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ font: '500 11px/1.3 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6 }}>
              {horizon}개월 예측 변화율
            </div>
            {changePct != null && direction ? (
              <>
                <div style={{ font: '700 24px/1 var(--font-sans)', color: DIRECTION_COLOR[direction], marginBottom: 2 }}>
                  {DIRECTION_ARROW[direction]} {fmtPct(changePct)}
                </div>
                <div style={{ font: '400 10px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                  단지 중위 기준
                </div>
              </>
            ) : (
              <div style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>데이터 처리 중</div>
            )}
          </div>

          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ font: '500 11px/1.3 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6 }}>
              최근 전세가율
            </div>
            {latestJeonse?.jeonseRatio != null ? (
              <>
                <div className="tnum" style={{ font: '700 24px/1 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 2 }}>
                  {latestJeonse.jeonseRatio.toFixed(1)}%
                </div>
                <div style={{ font: '400 10px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                  {latestJeonse.yearMonth}
                </div>
              </>
            ) : (
              <div style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>집계 중</div>
            )}
          </div>

          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ font: '500 11px/1.3 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6 }}>
              최근월 거래량
            </div>
            {latestHistory ? (
              <>
                <div className="tnum" style={{ font: '700 24px/1 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 2 }}>
                  {latestHistory.txCount}건
                </div>
                <div style={{ font: '400 10px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                  {latestHistory.yearMonth}
                </div>
              </>
            ) : (
              <div style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>집계 중</div>
            )}
          </div>

          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ font: '500 11px/1.3 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6 }}>
              AI 예측 단지
            </div>
            <div className="tnum" style={{ font: '700 24px/1 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 2 }}>
              {predTimeseries[0]?.complexCount ?? 0}개
            </div>
            <div style={{ font: '400 10px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
              MAPE 25% 이하
            </div>
          </div>

          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ font: '500 11px/1.3 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6 }}>
              미분양
            </div>
            {latestUnsold ? (
              <>
                <div className="tnum" style={{ font: '700 24px/1 var(--font-sans)', color: latestUnsold.unsoldCount > 500 ? '#dc2626' : latestUnsold.unsoldCount > 100 ? '#d97706' : 'var(--fg-pri)', marginBottom: 2 }}>
                  {latestUnsold.unsoldCount.toLocaleString('ko-KR')}세대
                </div>
                <div style={{ font: '400 10px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                  {unsoldChange !== null
                    ? `전월比 ${unsoldChange >= 0 ? '+' : ''}${unsoldChange.toLocaleString('ko-KR')}세대`
                    : `${latestUnsold.yearMonth.slice(0, 4)}.${latestUnsold.yearMonth.slice(4, 6)} 기준`}
                </div>
              </>
            ) : (
              <div style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>집계 중</div>
            )}
          </div>

          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ font: '500 11px/1.3 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 6 }}>
              인구 (KOSIS)
            </div>
            {latestPop ? (
              <>
                <div className="tnum" style={{ font: '700 24px/1 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 2 }}>
                  {(latestPop.population / 10000).toFixed(1)}만
                </div>
                <div style={{ font: '400 10px/1.4 var(--font-sans)', color: popYoyChange != null && popYoyChange < 0 ? '#dc2626' : 'var(--fg-tertiary)' }}>
                  {latestPop.year}년
                  {popYoyChange != null && ` · 전년比 ${popYoyChange >= 0 ? '+' : ''}${popYoyChange.toLocaleString('ko-KR')}명`}
                </div>
              </>
            ) : (
              <div style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>집계 중</div>
            )}
          </div>
        </div>

        {/* AI 지역 분석 코멘트 */}
        {aiCommentary && (
          <div style={{
            marginBottom: 24,
            padding: '14px 18px',
            borderRadius: 12,
            background: 'var(--bg-surface)',
            border: '1px solid var(--line-default)',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}>
            <span style={{
              flexShrink: 0,
              width: 28, height: 28,
              borderRadius: 6,
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--line-subtle)',
              display: 'grid', placeItems: 'center',
              font: '600 11px/1 var(--font-sans)',
              color: 'var(--fg-sec)',
            }}>AI</span>
            <div>
              <p style={{ font: '500 13px/1.6 var(--font-sans)', color: 'var(--fg-pri)', margin: '0 0 6px' }}>
                {aiCommentary}
              </p>
              <p style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                Gemini 2.0 Flash · 참고용, 투자 조언 아님
              </p>
            </div>
          </div>
        )}

        {/* 리스크 평가 */}
        <section aria-labelledby="risk-heading" style={{ marginBottom: 24 }}>
          <h2 id="risk-heading" style={{ font: '600 14px/1.4 var(--font-sans)', margin: '0 0 10px' }}>
            리스크 평가
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {riskItems.map(item => (
              <div key={item.label} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>{item.label}</span>
                  <span style={{
                    font: '600 11px/1 var(--font-sans)',
                    color: RISK_COLOR[item.grade],
                    border: `1px solid ${RISK_COLOR[item.grade]}`,
                    borderRadius: 4, padding: '2px 7px',
                  }}>
                    {RISK_LABEL[item.grade]}
                  </span>
                </div>
                <div className="tnum" style={{ font: '700 20px/1 var(--font-sans)', color: RISK_COLOR[item.grade], marginBottom: 6 }}>
                  {item.value}
                </div>
                <div style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 구입부담 지수 */}
        {(pir != null || jhai != null || hai != null) && (
          <section aria-labelledby="affordability-heading" style={{ marginBottom: 24 }}>
            <h2 id="affordability-heading" style={{ font: '600 14px/1.4 var(--font-sans)', margin: '0 0 10px' }}>
              구입부담 지수
              <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginLeft: 8 }}>
                경남 가구소득 {annualIncome?.toLocaleString('ko-KR')}만원 ({incomeData?.year})
                {mortgageRate != null && ` · 주담대 ${mortgageRate.toFixed(2)}% (ECOS)`}
              </span>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {hai != null && (
                <div className="card" style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 4 }}>
                        HAI <span style={{ fontWeight: 400, fontSize: 11 }}>(매매구입부담지수)</span>
                      </div>
                      <div style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                        100 이상: 소득 25%로 상환 가능
                      </div>
                    </div>
                    <span style={{
                      font: '600 11px/1 var(--font-sans)', borderRadius: 4, padding: '3px 8px',
                      ...(hai >= 150 ? { color: '#16a34a', border: '1px solid #16a34a' }
                        : hai >= 100 ? { color: '#d97706', border: '1px solid #d97706' }
                        : { color: '#dc2626', border: '1px solid #dc2626' }),
                    }}>
                      {hai >= 150 ? '양호' : hai >= 100 ? '주의' : '위험'}
                    </span>
                  </div>
                  <div className="tnum" style={{ font: '700 28px/1 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 6 }}>
                    {hai}
                  </div>
                  <div style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                    LTV 70% · 20년 원리금 기준
                  </div>
                </div>
              )}
              {pir != null && (
                <div className="card" style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 4 }}>
                        PIR <span style={{ fontWeight: 400, fontSize: 11 }}>(Price-to-Income)</span>
                      </div>
                      <div style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                        연소득 대비 매매가
                      </div>
                    </div>
                    <span style={{
                      font: '600 11px/1 var(--font-sans)', borderRadius: 4, padding: '3px 8px',
                      ...(pir < 8 ? { color: '#16a34a', border: '1px solid #16a34a' }
                        : pir < 12 ? { color: '#d97706', border: '1px solid #d97706' }
                        : { color: '#dc2626', border: '1px solid #dc2626' }),
                    }}>
                      {pir < 8 ? '양호' : pir < 12 ? '주의' : '위험'}
                    </span>
                  </div>
                  <div className="tnum" style={{ font: '700 28px/1 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 6 }}>
                    {pir.toFixed(1)}<span style={{ font: '500 14px/1 var(--font-sans)', marginLeft: 4 }}>배</span>
                  </div>
                  <div style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                    전국 평균 9~11배 · 서울 20배+
                  </div>
                </div>
              )}
              {jhai != null && (
                <div className="card" style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ font: '600 12px/1 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 4 }}>
                        JHAI <span style={{ fontWeight: 400, fontSize: 11 }}>(전세부담지수)</span>
                      </div>
                      <div style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                        연소득 대비 전세가
                      </div>
                    </div>
                    <span style={{
                      font: '600 11px/1 var(--font-sans)', borderRadius: 4, padding: '3px 8px',
                      ...(jhai < 4 ? { color: '#16a34a', border: '1px solid #16a34a' }
                        : jhai < 7 ? { color: '#d97706', border: '1px solid #d97706' }
                        : { color: '#dc2626', border: '1px solid #dc2626' }),
                    }}>
                      {jhai < 4 ? '양호' : jhai < 7 ? '주의' : '위험'}
                    </span>
                  </div>
                  <div className="tnum" style={{ font: '700 28px/1 var(--font-sans)', color: 'var(--fg-pri)', marginBottom: 6 }}>
                    {jhai.toFixed(1)}<span style={{ font: '500 14px/1 var(--font-sans)', marginLeft: 4 }}>배</span>
                  </div>
                  <div style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                    낮을수록 전세 부담 적음
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 인구 추이 */}
        {populationData.length > 0 && (
          <section aria-labelledby="population-heading" style={{ marginBottom: 24 }}>
            <h2 id="population-heading" style={{ font: '600 14px/1.4 var(--font-sans)', margin: '0 0 10px' }}>
              인구 추이
              <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginLeft: 8 }}>
                KOSIS 주민등록인구 · 연간
              </span>
              {pop5yChangePct != null && (
                <span style={{
                  marginLeft: 8, font: '600 11px/1 var(--font-sans)', padding: '2px 8px', borderRadius: 4,
                  ...(pop5yChangePct < -5 ? { color: '#dc2626', border: '1px solid #dc2626' }
                    : pop5yChangePct < 0 ? { color: '#d97706', border: '1px solid #d97706' }
                    : { color: '#16a34a', border: '1px solid #16a34a' }),
                }}>
                  5년 {pop5yChangePct >= 0 ? '+' : ''}{pop5yChangePct.toFixed(1)}%
                </span>
              )}
            </h2>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', font: '500 12px/1.4 var(--font-sans)' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--line-subtle)' }}>
                    <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--fg-tertiary)', fontWeight: 500 }}>연도</th>
                    <th style={{ padding: '8px 14px', textAlign: 'right', color: 'var(--fg-tertiary)', fontWeight: 500 }}>인구수</th>
                    <th style={{ padding: '8px 14px', textAlign: 'right', color: 'var(--fg-tertiary)', fontWeight: 500 }}>전년比</th>
                  </tr>
                </thead>
                <tbody>
                  {[...populationData].reverse().map((row, i) => {
                    const idx = populationData.length - 1 - i
                    const prev = idx > 0 ? populationData[idx - 1] : null
                    const diff = prev ? row.population - prev.population : null
                    return (
                      <tr key={row.year} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                        <td style={{ padding: '8px 14px', color: 'var(--fg-pri)', fontWeight: i === 0 ? 600 : 400 }}>
                          {row.year}년
                        </td>
                        <td className="tnum" style={{ padding: '8px 14px', textAlign: 'right', color: 'var(--fg-pri)' }}>
                          {row.population.toLocaleString('ko-KR')}명
                        </td>
                        <td className="tnum" style={{
                          padding: '8px 14px', textAlign: 'right',
                          color: diff == null ? 'var(--fg-tertiary)' : diff < 0 ? '#dc2626' : diff > 0 ? '#16a34a' : 'var(--fg-tertiary)',
                        }}>
                          {diff != null ? `${diff >= 0 ? '+' : ''}${diff.toLocaleString('ko-KR')}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 시세 + 예측 차트 */}
        <section aria-labelledby="chart-heading" style={{ marginBottom: 28 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 id="chart-heading" style={{ font: '600 14px/1.4 var(--font-sans)', margin: 0, color: 'var(--fg-pri)' }}>
                시세 흐름 + {horizon}개월 예측
              </h2>
              {areaBucket === '74' && (
                <span style={{ font: '500 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', background: 'var(--bg-surface-2)', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--line-subtle)' }}>
                  74㎡ 예측은 다음 배치 후 제공
                </span>
              )}
            </div>
            {history.length < 2 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--fg-tertiary)', font: '500 13px/1.4 var(--font-sans)' }}>
                거래 데이터 부족
              </div>
            ) : (
              <RegionalPriceChartWrapper
                data={history}
                title=""
                predictionData={predictionPoints.length > 0 ? predictionPoints : undefined}
              />
            )}
          </div>
        </section>

        {/* 전세가율 추이 */}
        {jeonseData.length > 0 && (
          <section aria-labelledby="jeonse-heading" style={{ marginBottom: 28 }}>
            <h2 id="jeonse-heading" style={{ font: '600 14px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
              전세가율 추이 (최근 12개월)
            </h2>
            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--line-default)' }}>
                    {['월', '매매 평균', '전세 평균', '전세가율', '거래량'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', font: '600 11px/1 var(--font-sans)',
                        color: 'var(--fg-sec)', whiteSpace: 'nowrap',
                        textAlign: h === '월' ? 'left' : 'right',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jeonseData.slice(-12).map(row => (
                    <tr key={row.yearMonth} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                      <td style={{ padding: '8px 12px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>{row.yearMonth}</td>
                      <td className="tnum" style={{ padding: '8px 12px', font: '500 12px/1 var(--font-sans)', textAlign: 'right' }}>{formatPrice(row.saleAvg)}</td>
                      <td className="tnum" style={{ padding: '8px 12px', font: '500 12px/1 var(--font-sans)', textAlign: 'right', color: 'var(--fg-sec)' }}>
                        {row.rentAvg ? formatPrice(row.rentAvg) : '—'}
                      </td>
                      <td className="tnum" style={{
                        padding: '8px 12px', font: '600 12px/1 var(--font-sans)', textAlign: 'right',
                        color: row.jeonseRatio != null && row.jeonseRatio > 80
                          ? '#dc2626'
                          : row.jeonseRatio != null && row.jeonseRatio > 70
                            ? '#d97706'
                            : 'var(--fg-pri)',
                      }}>
                        {row.jeonseRatio != null ? `${row.jeonseRatio.toFixed(1)}%` : '—'}
                      </td>
                      <td className="tnum" style={{ padding: '8px 12px', font: '400 12px/1 var(--font-sans)', textAlign: 'right', color: 'var(--fg-tertiary)' }}>
                        {row.saleCount}건
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 미분양 추이 */}
        {unsoldHistory.length > 0 && (
          <section aria-labelledby="unsold-heading" style={{ marginBottom: 28 }}>
            <h2 id="unsold-heading" style={{ font: '600 14px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
              미분양 추이
            </h2>
            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--line-default)' }}>
                    {['기준월', '미분양', '전월 대비'].map((h, i) => (
                      <th key={h} style={{
                        padding: '8px 12px', font: '600 11px/1 var(--font-sans)',
                        color: 'var(--fg-sec)', whiteSpace: 'nowrap',
                        textAlign: i === 0 ? 'left' : 'right',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...unsoldHistory].reverse().map((row, idx, arr) => {
                    const prev = arr[idx + 1]
                    const diff = prev ? row.unsoldCount - prev.unsoldCount : null
                    return (
                      <tr key={row.yearMonth} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                        <td style={{ padding: '8px 12px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
                          {row.yearMonth.slice(0, 4)}.{row.yearMonth.slice(4, 6)}
                        </td>
                        <td className="tnum" style={{
                          padding: '8px 12px', font: '600 12px/1 var(--font-sans)', textAlign: 'right',
                          color: row.unsoldCount > 500 ? '#dc2626' : row.unsoldCount > 100 ? '#d97706' : 'var(--fg-pri)',
                        }}>
                          {row.unsoldCount.toLocaleString('ko-KR')}세대
                        </td>
                        <td className="tnum" style={{
                          padding: '8px 12px', font: '500 12px/1 var(--font-sans)', textAlign: 'right',
                          color: diff == null ? 'var(--fg-tertiary)' : diff > 0 ? '#dc2626' : diff < 0 ? '#16a34a' : 'var(--fg-tertiary)',
                        }}>
                          {diff == null ? '—' : `${diff >= 0 ? '+' : ''}${diff.toLocaleString('ko-KR')}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 예측 상승 기대 단지 */}
        <section aria-labelledby="complex-heading" style={{ marginBottom: 28 }}>
          <h2 id="complex-heading" style={{ font: '600 14px/1.4 var(--font-sans)', margin: '0 0 12px' }}>
            예측 상승 기대 단지
          </h2>
          {complexRanking.length === 0 ? (
            <div className="card" style={{ padding: 28, textAlign: 'center' }}>
              <p style={{ font: '500 13px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
                예측 데이터를 처리 중입니다
              </p>
            </div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--line-default)' }}>
                    {[
                      { h: '#',         align: 'center' as const },
                      { h: '단지명',     align: 'left'   as const },
                      { h: '면적',       align: 'left'   as const },
                      { h: '현재 예측가', align: 'right'  as const },
                      { h: `${horizon === 12 ? '1년' : `${horizon}개월`} 후`, align: 'right'  as const },
                      { h: '변화율',     align: 'right'  as const },
                      { h: '신뢰도',     align: 'center' as const },
                    ].map(({ h, align }) => (
                      <th key={h} style={{ padding: '10px 12px', font: '600 11px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: align, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {complexRanking.map((item, idx) => {
                    const color = DIRECTION_COLOR[item.direction]
                    const conf  = confidenceBadge(item.mape)
                    return (
                      <tr key={`${item.complexId}-${item.areaBucket}`} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                        <td style={{ padding: '10px 12px', font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', textAlign: 'center', width: 36 }}>{idx + 1}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <Link href={`/complexes/${item.complexId}`} style={{ font: '600 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none' }}>
                            {item.complexName}
                          </Link>
                        </td>
                        <td style={{ padding: '10px 12px', font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                          {item.areaBucket === '소형' || item.areaBucket === '대형' ? item.areaBucket : `${item.areaBucket}㎡`}
                        </td>
                        <td className="tnum" style={{ padding: '10px 12px', font: '500 13px/1 var(--font-sans)', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatPrice(item.nearPrice)}</td>
                        <td className="tnum" style={{ padding: '10px 12px', font: '600 13px/1 var(--font-sans)', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatPrice(item.farPrice)}</td>
                        <td className="tnum" style={{ padding: '10px 12px', font: '700 13px/1 var(--font-sans)', color, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span aria-hidden="true" style={{ marginRight: 2 }}>{DIRECTION_ARROW[item.direction]}</span>
                          {fmtPct(item.changePct)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', color: conf.color, font: '600 11px/1 var(--font-sans)', border: `1px solid ${conf.color}`, borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                            {conf.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p style={{ font: '400 11px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '12px 0 0' }}>
          본 예측은 과거 실거래 패턴 기반 통계 모델이며 투자 결정에 활용하지 마세요.
        </p>
      </main>
    </div>
  )
}
