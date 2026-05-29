import { describe, it, expect } from 'vitest'
import { forecast, holtwinters, doubleExp, linearForecast } from './engine'

// 테스트용 단조 상승 데이터 생성 — 연속 YYYY-MM 시퀀스 (중복 월 없음)
// startYM: 'YYYY-MM' 형식 시작 월
function makeSeries(
  n: number,
  startYM = '2022-01',
  base = 30000,
  slope = 100,
): Array<{ yearMonth: string; avgPrice: number; txCount: number }> {
  const [startYear, startMonth] = startYM.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const total = startMonth! - 1 + i
    const year = startYear! + Math.floor(total / 12)
    const month = (total % 12) + 1
    return {
      yearMonth: `${year}-${String(month).padStart(2, '0')}`,
      avgPrice: base + slope * i,
      txCount: 5,
    }
  })
}

describe('forecast() 래퍼', () => {
  it('6개 미만 데이터 시 null 반환', () => {
    expect(forecast(makeSeries(5))).toBeNull()
  })

  it('6-11개 데이터 시 linear 모델 선택', () => {
    const result = forecast(makeSeries(8))
    expect(result?.modelName).toBe('linear')
    expect(result?.forecasts).toHaveLength(6)
  })

  it('12개(doubleExp 경계 최솟값) → double-exp 모델', () => {
    expect(forecast(makeSeries(12))?.modelName).toBe('double-exp')
  })

  it('12-23개 데이터 시 double-exp 모델 선택', () => {
    expect(forecast(makeSeries(15))?.modelName).toBe('double-exp')
  })

  it('23개(doubleExp 경계 최댓값) → double-exp 모델', () => {
    expect(forecast(makeSeries(23))?.modelName).toBe('double-exp')
  })

  it('24개(holt-winters 경계 최솟값) → holt-winters 모델', () => {
    expect(forecast(makeSeries(24))?.modelName).toBe('holt-winters')
  })

  it('24개 이상 데이터 시 holt-winters 모델 선택', () => {
    expect(forecast(makeSeries(28))?.modelName).toBe('holt-winters')
  })

  it('예측 6개월 반환', () => {
    expect(forecast(makeSeries(28))?.forecasts).toHaveLength(6)
  })

  it('예측 월이 입력 마지막 월 다음달부터 6개월 연속', () => {
    const data = makeSeries(24, '2023-01') // 2023-01 ~ 2024-12
    const result = forecast(data)!
    expect(result.forecasts[0]?.yearMonth).toBe('2025-01')
    expect(result.forecasts[5]?.yearMonth).toBe('2025-06')
  })

  it('신뢰구간: lower <= mean <= upper', () => {
    forecast(makeSeries(28))!.forecasts.forEach((f) => {
      expect(f.lower).toBeLessThanOrEqual(f.mean)
      expect(f.upper).toBeGreaterThanOrEqual(f.mean)
    })
  })

  it('trainingMape가 0~1 범위', () => {
    const result = forecast(makeSeries(28))!
    expect(result.trainingMape).toBeGreaterThanOrEqual(0)
    expect(result.trainingMape).toBeLessThanOrEqual(1)
  })

  it('trainingCount가 입력 데이터 길이와 일치', () => {
    const data = makeSeries(28)
    expect(forecast(data)?.trainingCount).toBe(28)
  })
})

describe('linearForecast()', () => {
  it('상승 데이터 → 양수 기울기 예측', () => {
    const prices = makeSeries(10)
    const result = linearForecast(
      prices.map((p) => p.avgPrice),
      3,
    )
    expect(result.point[2]).toBeGreaterThan(result.point[0]!)
  })
})

describe('doubleExp()', () => {
  it('12개 데이터로 6개 예측 반환', () => {
    const prices = makeSeries(12).map((p) => p.avgPrice)
    const result = doubleExp(prices, 6)
    expect(result.point).toHaveLength(6)
    expect(result.lower).toHaveLength(6)
    expect(result.upper).toHaveLength(6)
  })

  it('lower <= point <= upper 보장', () => {
    const prices = makeSeries(15).map((p) => p.avgPrice)
    const result = doubleExp(prices, 6)
    result.point.forEach((p, i) => {
      expect(result.lower[i]).toBeLessThanOrEqual(p)
      expect(result.upper[i]).toBeGreaterThanOrEqual(p)
    })
  })
})

describe('holtwinters()', () => {
  it('24개 데이터로 6개 예측 반환', () => {
    const prices = makeSeries(24).map((p) => p.avgPrice)
    const result = holtwinters(prices, 6)
    expect(result.point).toHaveLength(6)
    expect(result.lower).toHaveLength(6)
    expect(result.upper).toHaveLength(6)
  })

  it('lower <= point <= upper 보장', () => {
    const prices = makeSeries(28).map((p) => p.avgPrice)
    const result = holtwinters(prices, 6)
    result.point.forEach((p, i) => {
      expect(result.lower[i]).toBeLessThanOrEqual(p)
      expect(result.upper[i]).toBeGreaterThanOrEqual(p)
    })
  })
})
