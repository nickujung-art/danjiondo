import { describe, it, expect } from 'vitest'
import { buildCompareIds } from './compare'

describe('buildCompareIds', () => {
  it('falsy 값을 제거하고 최대 4개로 제한한다', () => {
    const result = buildCompareIds(['id1', null, '', 'id2', 'id3', 'id4', 'id5'] as string[])
    expect(result).toEqual(['id1', 'id2', 'id3', 'id4'])
  })
})

describe('computePriceHistory', () => {
  it('동일 yearMonth 거래 2건의 avgPrice를 올바르게 평균한다', async () => {
    const { computePriceHistory } = await import('./compare')
    const txRows = [
      { deal_date: '2025-06-15', price: 30000 },
      { deal_date: '2025-06-20', price: 40000 },
      { deal_date: '2025-07-10', price: 50000 },
    ]
    const result = computePriceHistory(txRows)
    const june = result.find(r => r.yearMonth === '2025-06')
    expect(june?.avgPrice).toBe(35000)
    expect(result).toHaveLength(2)
  })
})

describe('computeManagementCostAvg', () => {
  it('3컬럼 합산을 household_count로 나눠 만원 단위로 반환한다', async () => {
    const { computeManagementCostAvg } = await import('./compare')
    const rows = [
      { common_cost_total: 10_000_000, individual_cost_total: 5_000_000, long_term_repair_monthly: 1_000_000 },
      { common_cost_total: 12_000_000, individual_cost_total: 6_000_000, long_term_repair_monthly: 1_200_000 },
    ]
    // 월합계: row1=16M, row2=19.2M → 평균=(16M+19.2M)/2=17.6M → 17.6M/100/10000=17.6 → round=18
    const result = computeManagementCostAvg(rows, 100)
    expect(result).toBe(18)
  })

  it('household_count가 null이면 null을 반환한다', async () => {
    const { computeManagementCostAvg } = await import('./compare')
    expect(computeManagementCostAvg([], null)).toBeNull()
  })
})
