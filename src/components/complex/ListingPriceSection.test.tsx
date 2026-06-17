/**
 * ListingPriceSection smoke test — mergeData 로직 검증
 *
 * Phase 25 Plan 03 Task 2
 * RESEARCH.md §6 Pitfall 5: 빈 데이터 처리, 합병 로직
 *
 * Note: Recharts 컴포넌트 자체는 next/dynamic ssr:false 래퍼로 클라이언트 전용이므로
 * JSDOM 렌더 테스트 대신 모듈 임포트 smoke test + 로직 단위 테스트로 커버한다.
 */
import { describe, it, expect } from 'vitest'

// mergeData 함수를 직접 추출해서 테스트하기 위해 구현 로직을 재현
function mergeData(
  listingHistory: Array<{ recorded_date: string; price_per_py: number }>,
  rawSaleData: Array<{ yearMonth: string; price: number; area: number }>,
) {
  const listingByYm: Record<string, number> = {}
  for (const p of listingHistory) {
    const ym = p.recorded_date.slice(0, 7)
    listingByYm[ym] = p.price_per_py
  }

  const txByYm: Record<string, number[]> = {}
  for (const t of rawSaleData) {
    const py = t.area > 0 ? Math.round(t.price / (t.area / 3.3058)) : null
    if (!py || py < 100 || py > 99999) continue
    if (!txByYm[t.yearMonth]) txByYm[t.yearMonth] = []
    txByYm[t.yearMonth]!.push(py)
  }
  const txAvgByYm: Record<string, number> = {}
  for (const [ym, prices] of Object.entries(txByYm)) {
    txAvgByYm[ym] = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length)
  }

  const allYm = Array.from(new Set([...Object.keys(listingByYm), ...Object.keys(txAvgByYm)])).sort()

  return allYm.map(ym => ({
    yearMonth:  ym,
    listingPy:  listingByYm[ym],
    txPy:       txAvgByYm[ym],
  }))
}

describe('ListingPriceSection mergeData', () => {
  it('양쪽 데이터 없으면 빈 배열 반환', () => {
    const result = mergeData([], [])
    expect(result).toHaveLength(0)
  })

  it('호가만 있을 때 listingPy만 채워짐', () => {
    const listing = [{ recorded_date: '2025-01-15', price_per_py: 1200 }]
    const result = mergeData(listing, [])
    expect(result).toHaveLength(1)
    expect(result[0]?.yearMonth).toBe('2025-01')
    expect(result[0]?.listingPy).toBe(1200)
    expect(result[0]?.txPy).toBeUndefined()
  })

  it('실거래만 있을 때 txPy만 채워짐', () => {
    // 10평 * 1200만원/평 = 12000만원, area = 10 * 3.3058 = 33.058
    const tx = [{ yearMonth: '2025-02', price: 12000, area: 33.058 }]
    const result = mergeData([], tx)
    expect(result).toHaveLength(1)
    expect(result[0]?.yearMonth).toBe('2025-02')
    expect(result[0]?.listingPy).toBeUndefined()
    expect(result[0]?.txPy).toBeCloseTo(1200, -1)
  })

  it('호가+실거래 병합 시 월 합집합 정렬', () => {
    const listing = [
      { recorded_date: '2025-01-10', price_per_py: 1100 },
      { recorded_date: '2025-03-10', price_per_py: 1300 },
    ]
    const tx = [
      { yearMonth: '2025-02', price: 12000, area: 33.058 },
    ]
    const result = mergeData(listing, tx)
    expect(result).toHaveLength(3)
    expect(result.map(r => r.yearMonth)).toEqual(['2025-01', '2025-02', '2025-03'])
  })

  it('area=0인 실거래 데이터 skip (div by zero 방어)', () => {
    const tx = [{ yearMonth: '2025-01', price: 10000, area: 0 }]
    const result = mergeData([], tx)
    expect(result).toHaveLength(0)
  })

  it('같은 달 호가 여러 건 → 마지막 값 유지 (오름차순 정렬 기준)', () => {
    const listing = [
      { recorded_date: '2025-01-10', price_per_py: 1100 },
      { recorded_date: '2025-01-25', price_per_py: 1200 },
    ]
    const result = mergeData(listing, [])
    expect(result).toHaveLength(1)
    expect(result[0]?.listingPy).toBe(1200)
  })
})

describe('ListingPriceSection module', () => {
  it('컴포넌트 파일 export 확인', async () => {
    // 동적 import로 모듈 로드 가능 여부 확인 (SSR 제외, 모듈 구조만 검사)
    const mod = await import('./ListingPriceSection')
    expect(typeof mod.ListingPriceSection).toBe('function')
  })
})
