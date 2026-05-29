/**
 * 예측 엔진 — 순수 TypeScript 통계 예측 (외부 라이브러리 없음)
 *
 * 알고리즘 선택 규칙:
 *   data.length < 6  → null (insufficient-data)
 *   data.length 6-11 → linearForecast (선형회귀)
 *   data.length 12-23 → doubleExp (이중지수평활, Holt's linear)
 *   data.length >= 24 → holtwinters (삼중지수평활, 연간 계절성)
 *
 * 'server-only' 임포트 없음 — GitHub Actions 배치에서도 사용 가능
 */

// ─── 공개 인터페이스 ────────────────────────────────────────────────────────

export interface PricePoint {
  yearMonth: string // 'YYYY-MM'
  avgPrice: number // 만원
  txCount: number
}

export interface PredictionResult {
  forecasts: Array<{
    yearMonth: string // 'YYYY-MM' (예측 대상 월)
    mean: number // 만원
    lower: number // 80% CI 하한
    upper: number // 80% CI 상한
  }>
  modelName: 'holt-winters' | 'double-exp' | 'linear' | 'insufficient-data'
  trainingMape: number // 0.0~1.0
  trainingCount: number // 학습에 사용된 월 수
}

// ─── 내부 예측 타입 ────────────────────────────────────────────────────────

interface RawForecast {
  point: number[]
  lower: number[]
  upper: number[]
}

// ─── 유틸리티 함수 ────────────────────────────────────────────────────────

/**
 * 배열의 표준편차를 계산한다.
 */
function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

/**
 * NaN/Infinity/음수를 필터링한 유효한 가격 배열을 반환한다.
 * T-22-01-01 (Tampering) 위협 완화
 */
function sanitizePrices(prices: number[]): number[] {
  return prices.filter((p) => Number.isFinite(p) && p > 0)
}

/**
 * 'YYYY-MM' 마지막 월에서 n개월 뒤의 달을 반환한다.
 */
function addMonths(ym: string, n: number): string {
  const parts = ym.split('-')
  const year  = parseInt(parts[0] ?? '', 10)
  const month = parseInt(parts[1] ?? '', 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`addMonths: invalid yearMonth format "${ym}"`)
  }
  const total    = year * 12 + month - 1 + n
  const newYear  = Math.floor(total / 12)
  const newMonth = (total % 12) + 1
  return `${newYear}-${String(newMonth).padStart(2, '0')}`
}

/**
 * 입력 마지막 월 다음달부터 horizon개 'YYYY-MM' 배열을 생성한다.
 */
function buildForecastMonths(lastYM: string, horizon: number): string[] {
  return Array.from({ length: horizon }, (_, i) => addMonths(lastYM, i + 1))
}

/**
 * 신뢰구간을 계산한다 (잔차 std × 1.96).
 * horizon이 길어질수록 불확실성이 증가하도록 √h 스케일링 적용.
 */
function buildConfidenceIntervals(
  point: number[],
  residuals: number[],
): { lower: number[]; upper: number[] } {
  const sigma = stdDev(residuals)
  const z = 1.96 // 95% CI (plan spec: 1.96×σ)
  return {
    lower: point.map((p, h) => Math.max(0, p - z * sigma * Math.sqrt(h + 1))),
    upper: point.map((p, h) => p + z * sigma * Math.sqrt(h + 1)),
  }
}

// ─── 선형회귀 예측 ────────────────────────────────────────────────────────

/**
 * 최소제곱법 선형회귀로 horizon개 예측값을 반환한다.
 * prices.length >= 6 권장.
 */
export function linearForecast(prices: number[], horizon = 6): RawForecast {
  const safe = sanitizePrices(prices)
  const n = safe.length

  // 기울기 β₁, 절편 β₀ 계산
  const xs = Array.from({ length: n }, (_, i) => i)
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = safe.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * (safe[i] ?? 0), 0)
  const sumX2 = xs.reduce((s, x) => s + x * x, 0)

  const denom = n * sumX2 - sumX * sumX
  const beta1 = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
  const beta0 = (sumY - beta1 * sumX) / n

  // 예측
  const point = Array.from(
    { length: horizon },
    (_, h) => beta0 + beta1 * (n + h),
  )

  // 잔차
  const residuals = safe.map((y, i) => y - (beta0 + beta1 * i))

  const { lower, upper } = buildConfidenceIntervals(point, residuals)
  return { point, lower, upper }
}

// ─── 이중지수평활 (Holt's Linear Method) ────────────────────────────────

/**
 * α/β 그리드 탐색으로 최적 파라미터를 찾아 Holt's linear method 적용.
 * prices.length >= 12 권장.
 */
export function doubleExp(prices: number[], horizon = 6): RawForecast {
  const safe = sanitizePrices(prices)
  const n = safe.length
  const gridValues = [0.1, 0.3, 0.5, 0.7, 0.9]
  const holdout = Math.min(6, Math.floor(n / 2))
  const trainEnd = n - holdout

  let bestRmse = Infinity
  let bestAlpha = 0.3
  let bestBeta = 0.1

  // 그리드 탐색 (25 조합)
  for (const alpha of gridValues) {
    for (const beta of gridValues) {
      const { rmse } = runDoubleExp(safe.slice(0, trainEnd), alpha, beta, holdout, safe.slice(trainEnd))
      if (rmse < bestRmse) {
        bestRmse = rmse
        bestAlpha = alpha
        bestBeta = beta
      }
    }
  }

  // 전체 데이터로 최적 파라미터 적용 후 예측
  const { level, trend, residuals } = fitDoubleExp(safe, bestAlpha, bestBeta)

  const point = Array.from(
    { length: horizon },
    (_, h) => level + trend * (h + 1),
  )

  const { lower, upper } = buildConfidenceIntervals(point, residuals)
  return { point, lower, upper }
}

/**
 * Holt's linear method 내부 피팅. 잔차와 최종 level/trend 반환.
 */
function fitDoubleExp(
  prices: number[],
  alpha: number,
  beta: number,
): { level: number; trend: number; residuals: number[] } {
  const n = prices.length
  let L = prices[0] ?? 0
  let T = (prices[1] ?? prices[0] ?? 0) - (prices[0] ?? 0)

  const residuals: number[] = []

  for (let t = 1; t < n; t++) {
    const y = prices[t] ?? 0
    const prevL = L
    L = alpha * y + (1 - alpha) * (L + T)
    T = beta * (L - prevL) + (1 - beta) * T
    residuals.push(y - (prevL + T))
  }

  return { level: L, trend: T, residuals }
}

/**
 * hold-out RMSE 계산용.
 */
function runDoubleExp(
  trainPrices: number[],
  alpha: number,
  beta: number,
  holdout: number,
  actual: number[],
): { rmse: number } {
  const { level, trend } = fitDoubleExp(trainPrices, alpha, beta)
  let ssq = 0
  for (let h = 0; h < holdout; h++) {
    const pred = level + trend * (h + 1)
    const act = actual[h] ?? 0
    ssq += (pred - act) ** 2
  }
  return { rmse: Math.sqrt(ssq / holdout) }
}

// ─── 삼중지수평활 (Holt-Winters) ────────────────────────────────────────

/**
 * α/β/γ 그리드 탐색으로 최적 파라미터를 찾아 Holt-Winters 삼중지수평활 적용.
 * period = 12 (연간 계절성).
 * prices.length >= 24 권장.
 */
export function holtwinters(prices: number[], horizon = 6): RawForecast {
  const safe = sanitizePrices(prices)
  const n = safe.length
  const period = 12
  const gridValues = [0.1, 0.3, 0.5, 0.7, 0.9]
  const holdout = Math.min(6, Math.floor(n / 4))
  const trainEnd = n - holdout

  let bestRmse = Infinity
  let bestAlpha = 0.3
  let bestBeta = 0.1
  let bestGamma = 0.2

  // 그리드 탐색 (125 조합)
  for (const alpha of gridValues) {
    for (const beta of gridValues) {
      for (const gamma of gridValues) {
        const { rmse } = runHoltWinters(
          safe.slice(0, trainEnd),
          alpha, beta, gamma, period,
          holdout,
          safe.slice(trainEnd),
        )
        if (rmse < bestRmse) {
          bestRmse = rmse
          bestAlpha = alpha
          bestBeta = beta
          bestGamma = gamma
        }
      }
    }
  }

  // 전체 데이터로 최적 파라미터 적용 후 예측
  const { level, trend, seasonal, residuals } = fitHoltWinters(
    safe,
    bestAlpha,
    bestBeta,
    bestGamma,
    period,
  )

  const point = Array.from({ length: horizon }, (_, h) => {
    const seasonIdx = (n - period + (h % period)) % period
    const s = seasonal[seasonIdx] ?? 1
    return (level + trend * (h + 1)) * s
  })

  const { lower, upper } = buildConfidenceIntervals(point, residuals)
  return { point, lower, upper }
}

/**
 * Holt-Winters 가법/승법 혼합 (승법 계절성) 내부 피팅.
 */
function fitHoltWinters(
  prices: number[],
  alpha: number,
  beta: number,
  gamma: number,
  period: number,
): { level: number; trend: number; seasonal: number[]; residuals: number[] } {
  const n = prices.length

  // 초기 level: 첫 period의 평균
  const firstPeriodMean =
    prices.slice(0, period).reduce((a, b) => a + b, 0) / period
  let L = firstPeriodMean > 0 ? firstPeriodMean : 1

  // 초기 trend: 두 번째 period 평균 - 첫 번째 period 평균, / period
  let T = 0
  if (n >= period * 2) {
    const secondPeriodMean =
      prices.slice(period, period * 2).reduce((a, b) => a + b, 0) / period
    T = (secondPeriodMean - firstPeriodMean) / period
  }

  // 초기 계절 인자: 각 월 / 전체 평균
  const seasonal: number[] = Array.from({ length: period }, (_, m) => {
    const val = prices[m] ?? L
    return L > 0 ? val / L : 1
  })

  const residuals: number[] = []

  for (let t = period; t < n; t++) {
    const y = prices[t] ?? 0
    const sIdx = t % period
    const S = seasonal[sIdx] ?? 1
    const prevL = L

    L = alpha * (y / (S || 1)) + (1 - alpha) * (L + T)
    T = beta * (L - prevL) + (1 - beta) * T
    seasonal[sIdx] = gamma * (y / (L || 1)) + (1 - gamma) * S

    const fitted = (prevL + T) * S
    residuals.push(y - fitted)
  }

  return { level: L, trend: T, seasonal, residuals }
}

/**
 * hold-out RMSE 계산용.
 */
function runHoltWinters(
  trainPrices: number[],
  alpha: number,
  beta: number,
  gamma: number,
  period: number,
  holdout: number,
  actual: number[],
): { rmse: number } {
  const n = trainPrices.length
  const { level, trend, seasonal } = fitHoltWinters(
    trainPrices,
    alpha, beta, gamma, period,
  )

  let ssq = 0
  for (let h = 0; h < holdout; h++) {
    const seasonIdx = (n - period + (h % period)) % period
    const s = seasonal[seasonIdx] ?? 1
    const pred = (level + trend * (h + 1)) * s
    const act = actual[h] ?? 0
    ssq += (pred - act) ** 2
  }

  return { rmse: Math.sqrt(ssq / holdout) }
}

// ─── MAPE 계산 ────────────────────────────────────────────────────────────

/**
 * 마지막 holdout개 hold-out one-step-ahead MAPE를 계산한다.
 * trainingMape: 0.0~1.0 범위 클리핑.
 */
function computeMape(
  prices: number[],
  modelName: 'holt-winters' | 'double-exp' | 'linear',
): number {
  const holdout = Math.min(6, Math.floor(prices.length / 4))
  if (holdout < 1) return 0

  const trainEnd = prices.length - holdout
  const train = prices.slice(0, trainEnd)
  const actual = prices.slice(trainEnd)

  let predictions: number[]

  if (modelName === 'holt-winters') {
    const result = holtwinters(train, holdout)
    predictions = result.point
  } else if (modelName === 'double-exp') {
    const result = doubleExp(train, holdout)
    predictions = result.point
  } else {
    const result = linearForecast(train, holdout)
    predictions = result.point
  }

  let mapeSum = 0
  let count = 0
  for (let i = 0; i < holdout; i++) {
    const act = actual[i] ?? 0
    const pred = predictions[i] ?? 0
    if (act !== 0) {
      mapeSum += Math.abs(act - pred) / act
      count++
    }
  }

  if (count === 0) return 0
  return Math.min(1, mapeSum / count) // 0~1 클리핑
}

// ─── 메인 래퍼 ────────────────────────────────────────────────────────────

/**
 * 데이터 길이에 따라 자동으로 알고리즘을 선택하여 6개월 예측을 반환한다.
 *
 * @param data - PricePoint 배열 (yearMonth 오름차순)
 * @param horizon - 예측 개월 수 (기본 6)
 * @returns PredictionResult | null (6개 미만 데이터 시 null)
 */
export function forecast(
  data: PricePoint[],
  horizon = 6,
): PredictionResult | null {
  if (data.length < 6) return null

  const prices = sanitizePrices(data.map((d) => d.avgPrice))
  if (prices.length < 6) return null

  const lastYM = data[data.length - 1]?.yearMonth ?? '2024-12'
  const months = buildForecastMonths(lastYM, horizon)

  let raw: RawForecast
  let modelName: 'holt-winters' | 'double-exp' | 'linear'

  if (data.length >= 24) {
    raw = holtwinters(prices, horizon)
    modelName = 'holt-winters'
  } else if (data.length >= 12) {
    raw = doubleExp(prices, horizon)
    modelName = 'double-exp'
  } else {
    raw = linearForecast(prices, horizon)
    modelName = 'linear'
  }

  const trainingMape = computeMape(prices, modelName)

  const forecasts = months.map((yearMonth, i) => ({
    yearMonth,
    mean: Math.round(raw.point[i] ?? 0),
    lower: Math.round(raw.lower[i] ?? 0),
    upper: Math.round(raw.upper[i] ?? 0),
  }))

  return {
    forecasts,
    modelName,
    trainingMape,
    trainingCount: data.length,
  }
}
