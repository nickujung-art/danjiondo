import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { fetchMortgageRate, fetchMortgageRateSeries, type MortgageRatePoint } from '@/services/ecos'
import { fetchPopulationBySgg } from '@/services/kosis'

// ─── Prediction Types ─────────────────────────────────────────────────────────

export interface PredictionPoint {
  yearMonth:    string
  mean:         number
  lower:        number
  upper:        number
  modelName:    string
  trainingMape: number
}

// ─── Allowlists ───────────────────────────────────────────────────────────────

export const ALLOWED_SGG_CODES = ['48121', '48123', '48125', '48127', '48129', '48250'] as const
export const ALLOWED_AREA_BUCKETS = ['소형', '59', '74', '84', '대형'] as const
export type AreaBucket = typeof ALLOWED_AREA_BUCKETS[number]

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegionalPricePoint {
  yearMonth: string
  avgPrice:  number
  txCount:   number
}

export interface AreaType {
  bucket:  AreaBucket
  txCount: number
}

export interface PredictionRankingItem {
  complexId:    string
  complexName:  string
  si:           string | null
  gu:           string | null
  sggCode:      string
  areaBucket:   string
  nearPrice:    number   // 만원
  farPrice:     number   // 만원
  changePct:    number   // %
  mape:         number   // 0~1
  direction:    'up' | 'flat' | 'down'
  aiCommentary: string | null
}

export interface RegionalPredictionSummary {
  sggCode:         string
  complexCount:    number
  medianChangePct: number
  avgNearPrice:    number
  avgFarPrice:     number
  direction:       'up' | 'flat' | 'down'
}

function directionOf(changePct: number): 'up' | 'flat' | 'down' {
  if (changePct > 3) return 'up'
  if (changePct < -3) return 'down'
  return 'flat'
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * 지역 단위 월별 시세 이력 조회.
 * invest_regional_price_history RPC를 호출한다.
 * 오류 시 빈 배열 반환 (페이지 레벨에서 .catch(() => []) 처리).
 */
export async function getRegionalPriceHistory(
  supabase:   SupabaseClient<Database>,
  sggCode:    string | undefined,
  areaBucket: AreaBucket | undefined,
  months = 24,
): Promise<RegionalPricePoint[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('invest_regional_price_history', {
    p_sgg_code:    sggCode    ?? null,
    p_area_bucket: areaBucket ?? null,
    p_months:      months,
  })
  if (error || !data) return []
  const currentYM = new Date().toISOString().slice(0, 7) // 'YYYY-MM' — 진행 중인 월은 거래 수가 적어 차트 끊김처럼 보임
  return (data as Array<{ year_month: string; avg_price: number; tx_count: number }>)
    .map(r => ({
      yearMonth: r.year_month,
      avgPrice:  Number(r.avg_price),
      txCount:   Number(r.tx_count),
    }))
    .filter(r => r.yearMonth < currentYM)
}

/**
 * 단지의 거래 가능 타입 목록 조회 (tx_count >= 3인 타입만).
 * transactions 직접 쿼리 사용 (area_m2 기준 버킷화).
 * 오류 시 빈 배열 반환.
 */
export async function getComplexAreaTypes(
  supabase:  SupabaseClient<Database>,
  complexId: string,
  months = 24,
): Promise<AreaType[]> {
  const buckets: AreaBucket[] = ['소형', '59', '74', '84', '대형']
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const counts = await Promise.all(
    buckets.map(async (bucket) => {
      const bucketFilter =
        bucket === '소형'
          ? { lt: 50 }
          : bucket === '59'
          ? { gte: 50, lt: 66 }
          : bucket === '74'
          ? { gte: 66, lt: 79 }
          : bucket === '84'
          ? { gte: 79, lt: 95 }
          : { gte: 95 }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('complex_id', complexId)
        .eq('deal_type', 'sale')
        .gte('deal_date', cutoffStr)
        .is('cancel_date', null)
        .is('superseded_by', null)

      if ('lt' in bucketFilter && 'gte' in bucketFilter) {
        q = q
          .gte('area_m2', (bucketFilter as { gte: number; lt: number }).gte)
          .lt('area_m2', (bucketFilter as { gte: number; lt: number }).lt)
      } else if ('lt' in bucketFilter) {
        q = q.lt('area_m2', (bucketFilter as { lt: number }).lt)
      } else {
        q = q.gte('area_m2', (bucketFilter as { gte: number }).gte)
      }

      const { count } = await q
      return { bucket, count: count ?? 0 }
    })
  )

  return counts
    .filter(({ count }) => count >= 3)
    .map(({ bucket, count }) => ({ bucket, txCount: count }))
}

/**
 * 단지+타입별 월별 시세 이력 조회.
 * invest_price_history RPC를 호출한다.
 * 오류 시 빈 배열 반환.
 */
export async function getComplexPriceByType(
  supabase:   SupabaseClient<Database>,
  complexId:  string,
  areaBucket: AreaBucket | undefined,
  months = 24,
): Promise<RegionalPricePoint[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('invest_price_history', {
    p_complex_id:  complexId,
    p_deal_type:   'sale',
    p_months:      months,
    p_area_bucket: areaBucket ?? null,
  })
  if (error || !data) return []
  return (data as Array<{ year_month: string; avg_price: number; tx_count: number }>).map(r => ({
    yearMonth: r.year_month,
    avgPrice:  Number(r.avg_price),
    txCount:   Number(r.tx_count),
  }))
}

/**
 * 단지별 6개월 예측 상승률 랭킹 조회.
 * invest_prediction_ranking RPC를 호출한다.
 * 오류 시 빈 배열 반환.
 */
export async function getTopPredictionComplexes(
  supabase:   SupabaseClient<Database>,
  sggCode?:   string,
  areaBucket?: string,
  limit = 10,
): Promise<PredictionRankingItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('invest_prediction_ranking', {
    p_sgg_code:    sggCode    ?? null,
    p_area_bucket: areaBucket ?? null,
    p_max_mape:    0.25,
    p_limit:       limit,
  })
  if (error || !data) return []
  return (data as Array<{
    complex_id:    string
    complex_name:  string
    si:            string | null
    gu:            string | null
    sgg_code:      string
    area_bucket:   string
    near_price:    number
    far_price:     number
    change_pct:    number
    avg_mape:      number
    ai_commentary: string | null
  }>).map(r => {
    const changePct = Number(r.change_pct)
    return {
      complexId:    r.complex_id,
      complexName:  r.complex_name,
      si:           r.si,
      gu:           r.gu,
      sggCode:      r.sgg_code,
      areaBucket:   r.area_bucket,
      nearPrice:    Number(r.near_price),
      farPrice:     Number(r.far_price),
      changePct,
      mape:         Number(r.avg_mape),
      direction:    directionOf(changePct),
      aiCommentary: r.ai_commentary,
    }
  })
}

/**
 * 지역(sgg)별 예측 방향 요약 조회.
 * invest_regional_prediction_summary RPC를 호출한다.
 * 오류 시 빈 배열 반환.
 */
export async function getRegionalPredictionSummary(
  supabase:    SupabaseClient<Database>,
  areaBucket?: string,
): Promise<RegionalPredictionSummary[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('invest_regional_prediction_summary', {
    p_area_bucket: areaBucket ?? null,
  })
  if (error || !data) return []
  return (data as Array<{
    sgg_code:          string
    complex_count:     number
    median_change_pct: number
    avg_near_price:    number
    avg_far_price:     number
  }>).map(r => {
    const medianChangePct = Number(r.median_change_pct)
    return {
      sggCode:         r.sgg_code,
      complexCount:    Number(r.complex_count),
      medianChangePct,
      avgNearPrice:    Number(r.avg_near_price),
      avgFarPrice:     Number(r.avg_far_price),
      direction:       directionOf(medianChangePct),
    }
  })
}

// ─── Regional Prediction Timeseries ──────────────────────────────────────────

export interface RegionalPredictionTimePoint {
  predictedMonth: string   // 'YYYY-MM'
  medianPrice:    number
  lowerPrice:     number
  upperPrice:     number
  complexCount:   number
}

export interface RegionalJeonsePoint {
  yearMonth:   string
  saleAvg:     number
  rentAvg:     number | null
  jeonseRatio: number | null
  saleCount:   number
}

export async function getRegionalPredictionTimeseries(
  supabase:     SupabaseClient<Database>,
  sggCode:      string,
  areaBucket?:  string,
): Promise<RegionalPredictionTimePoint[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('invest_regional_prediction_timeseries', {
    p_sgg_code:    sggCode,
    p_area_bucket: areaBucket ?? null,
    p_max_mape:    0.25,
  })
  if (error || !data) return []
  return (data as Array<{
    predicted_month: string
    median_price:    number
    lower_price:     number
    upper_price:     number
    complex_count:   number
  }>).map(r => ({
    predictedMonth: r.predicted_month,
    medianPrice:    Number(r.median_price),
    lowerPrice:     Number(r.lower_price),
    upperPrice:     Number(r.upper_price),
    complexCount:   Number(r.complex_count),
  }))
}

export async function getRegionalJeonseRatio(
  supabase:    SupabaseClient<Database>,
  sggCode?:    string,
  areaBucket?: string,
  months = 24,
): Promise<RegionalJeonsePoint[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('invest_regional_jeonse_ratio', {
    p_sgg_code:    sggCode    ?? null,
    p_area_bucket: areaBucket ?? null,
    p_months:      months,
  })
  if (error || !data) return []
  return (data as Array<{
    year_month:   string
    sale_avg:     number
    rent_avg:     number | null
    jeonse_ratio: number | null
    sale_count:   number
    rent_count:   number
  }>).map(r => ({
    yearMonth:   r.year_month,
    saleAvg:     Number(r.sale_avg),
    rentAvg:     r.rent_avg != null ? Number(r.rent_avg) : null,
    jeonseRatio: r.jeonse_ratio != null ? Number(r.jeonse_ratio) : null,
    saleCount:   Number(r.sale_count),
  }))
}

// ─── Regional Unsold ─────────────────────────────────────────────────────────

export interface RegionalUnsoldPoint {
  yearMonth:  string   // 'YYYYMM'
  unsoldCount: number
}

export async function getRegionalUnsold(
  supabase: SupabaseClient<Database>,
  sggCode:  string,
): Promise<RegionalUnsoldPoint[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('regional_unsold')
    .select('year_month, unsold_count')
    .eq('sgg_code', sggCode)
    .order('year_month', { ascending: false })
    .limit(13)
  if (error || !data) return []
  return (data as Array<{ year_month: string; unsold_count: number }>)
    .map(r => ({ yearMonth: r.year_month, unsoldCount: Number(r.unsold_count) }))
    .reverse()
}

// ─── Income (PIR/JHAI 계산용) ─────────────────────────────────────────────────

export interface RegionalIncome {
  year:      number
  avgIncome: number  // 연간 평균 가구소득 (만원)
}

export async function getLatestRegionalIncome(
  supabase: SupabaseClient<Database>,
  regionCode = 'gyeongnam',
): Promise<RegionalIncome | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('regional_income')
    .select('year, avg_income')
    .eq('region_code', regionCode)
    .order('year', { ascending: false })
    .limit(1)
    .single()
  if (error || !data) return null
  return { year: data.year, avgIncome: Number(data.avg_income) }
}

// ─── Mortgage Rate (ECOS) ─────────────────────────────────────────────────────

export interface MortgageRate {
  rate:      number   // 연%
  source:    'ecos'
}

export async function getMortgageRate(): Promise<MortgageRate | null> {
  const rate = await fetchMortgageRate()
  if (rate == null) return null
  return { rate, source: 'ecos' }
}

export type { MortgageRatePoint }

export async function getMortgageRateSeries(months = 24): Promise<MortgageRatePoint[]> {
  return fetchMortgageRateSeries(months)
}

// ─── Population (KOSIS) ──────────────────────────────────────────────────────

export interface PopulationPoint {
  year:       number
  population: number  // 명
  sggCode:    string
  sggName:    string
}

export async function getRegionalPopulation(
  sggCode: string,
  years = 10,
): Promise<PopulationPoint[]> {
  const rows = await fetchPopulationBySgg([sggCode], years)
  return rows.map(r => ({
    year:       r.year,
    population: r.population,
    sggCode:    r.sggCode,
    sggName:    r.sggName,
  }))
}

// ─── Regional Gap Stats ───────────────────────────────────────────────────────

export interface RegionalGapItem {
  complexId:         string
  complexName:       string
  medianSalePrice:   number   // 만원
  medianJeonsePrice: number   // 만원
  gapAmount:         number   // 만원 (매매-전세)
  gapRatio:          number   // % (갭/매매)
  jeonseRatio:       number   // %
  riskLevel:         string   // 'safe' | 'caution' | 'danger'
  saleCount:         number
  jeonseCount:       number
}

/**
 * 지역 내 갭투자 가능 단지 — 갭 금액 오름차순 (소자본 진입 순).
 * sale_count, jeonse_count 각 3건 이상인 단지만 포함.
 * 최대 limit건 반환.
 */
export async function getRegionalGapItems(
  supabase:  SupabaseClient<Database>,
  sggCode:   string,
  limit = 12,
): Promise<RegionalGapItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('complex_gap_stats')
    .select(
      'gap_amount, gap_ratio, jeonse_ratio, risk_level, sale_count, jeonse_count, median_sale_price, median_jeonse_price, complexes!inner(id, canonical_name, sgg_code)',
    )
    .eq('complexes.sgg_code', sggCode)
    .gte('sale_count', 3)
    .gte('jeonse_count', 3)
    .gt('gap_amount', 0)            // 역전세(갭 음수) 제외 — 소자본 투자 대상이 아님
    .order('gap_amount', { ascending: true })
    .limit(limit)
  if (error || !data) return []

  type RawRow = {
    gap_amount:          number
    gap_ratio:           string | number
    jeonse_ratio:        string | number
    risk_level:          string
    sale_count:          number
    jeonse_count:        number
    median_sale_price:   number
    median_jeonse_price: number
    complexes:
      | { id: string; canonical_name: string; sgg_code: string | null }
      | Array<{ id: string; canonical_name: string; sgg_code: string | null }>
      | null
  }

  const result: RegionalGapItem[] = []
  for (const raw of data as RawRow[]) {
    const c = Array.isArray(raw.complexes) ? raw.complexes[0] : raw.complexes
    if (!c) continue
    result.push({
      complexId:         c.id,
      complexName:       c.canonical_name,
      medianSalePrice:   raw.median_sale_price,
      medianJeonsePrice: raw.median_jeonse_price,
      gapAmount:         raw.gap_amount,
      gapRatio:          Number(raw.gap_ratio),
      jeonseRatio:       Number(raw.jeonse_ratio),
      riskLevel:         raw.risk_level,
      saleCount:         raw.sale_count,
      jeonseCount:       raw.jeonse_count,
    })
  }
  return result
}

/**
 * HAI (주택구입부담지수) 계산.
 * HAI = (월소득 × 25%) / 월원리금상환액 × 100
 * 100 초과: 구입 여력 있음 / 100 미만: 부담
 */
export function calcHAI(opts: {
  avgPrice:     number   // 만원
  annualIncome: number   // 만원/년
  mortgageRate: number   // 연%
  ltv?:         number   // 기본 0.7
  loanYears?:   number   // 기본 20
}): number {
  const { avgPrice, annualIncome, mortgageRate, ltv = 0.7, loanYears = 20 } = opts
  const monthlyIncome  = annualIncome / 12
  const loanAmount     = avgPrice * ltv
  const r              = mortgageRate / 100 / 12
  const n              = loanYears * 12
  const monthlyPayment = r > 0
    ? loanAmount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)
    : loanAmount / n
  if (monthlyPayment <= 0) return 0
  return Math.round((monthlyIncome * 0.25) / monthlyPayment * 100)
}

/**
 * 지역 집계 예측값 조회.
 * complex_price_predictions 테이블에서 sgg_code 지역의 단지들 예측 중위값을 반환.
 * 예측 데이터가 없으면 빈 배열 반환 (graceful degradation, D-07).
 */
export async function getRegionalPricePredictions(
  supabase:   SupabaseClient<Database>,
  sggCode:    string | undefined,
  areaBucket: AreaBucket | undefined,
): Promise<PredictionPoint[]> {
  if (!sggCode || !areaBucket) return []

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

  // 1) 해당 sgg_code의 단지 id 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: complexIds } = await (supabase as any)
    .from('complexes')
    .select('id')
    .eq('sgg_code', sggCode)
    .limit(500)

  if (!complexIds || complexIds.length === 0) return []
  const ids = (complexIds as { id: string }[]).map(c => c.id)

  // 2) 예측 데이터 조회 (최근 2일 내 computed)
  // ids.length × 6 (예측 개월) + 버퍼; PostgREST 기본 1000행 한도 방지 (CR-02)
  const rowLimit = Math.min(ids.length * 6 + 100, 6000)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('complex_price_predictions')
    .select('predicted_month, predicted_price_mean, predicted_price_lower, predicted_price_upper, model_name, training_mape')
    .in('complex_id', ids)
    .eq('area_bucket', areaBucket)
    .gte('computed_at', twoDaysAgo)
    .limit(rowLimit)
    .order('predicted_month', { ascending: true })

  if (error || !data) return []

  // 3) 같은 predicted_month끼리 mean/lower/upper 각각 중위값 집계
  type MonthBucket = { means: number[]; lowers: number[]; uppers: number[] }
  const byMonth = new Map<string, MonthBucket>()
  for (const row of (data as Array<{
    predicted_month:       string
    predicted_price_mean:  number
    predicted_price_lower: number
    predicted_price_upper: number
    model_name:            string
    training_mape:         number
  }>)) {
    const ym = row.predicted_month.slice(0, 7) // 'YYYY-MM'
    if (!byMonth.has(ym)) byMonth.set(ym, { means: [], lowers: [], uppers: [] })
    const b = byMonth.get(ym)!
    b.means.push(row.predicted_price_mean)
    b.lowers.push(row.predicted_price_lower)
    b.uppers.push(row.predicted_price_upper)
  }

  // 중위값 계산 (DB 저장된 실제 Holt-Winters 신뢰구간 사용)
  function median(arr: number[]): number {
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
      : sorted[mid]!
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, b]) => ({
      yearMonth:    ym,
      mean:         median(b.means),
      lower:        median(b.lowers),
      upper:        median(b.uppers),
      modelName:    'regional-median',
      trainingMape: 0,
    }))
}
