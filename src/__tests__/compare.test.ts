/**
 * DIFF-06 — 비교 표 URL state + 병렬 fetch
 * RED: 구현 없음 → 실패 예상
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('compare limit', () => {
  it('ids.slice(0, 4): 5개 입력 → 4개만 처리', async () => {
    const { buildCompareIds } = await import('@/lib/data/compare')
    const ids = ['a', 'b', 'c', 'd', 'e']
    const result = buildCompareIds(ids)
    expect(result).toHaveLength(4)
    expect(result).toEqual(['a', 'b', 'c', 'd'])
  })

  it('빈 배열 입력 → 빈 배열 반환', async () => {
    const { buildCompareIds } = await import('@/lib/data/compare')
    expect(buildCompareIds([])).toEqual([])
  })

  it('null/undefined ID → 필터링됨', async () => {
    const { buildCompareIds } = await import('@/lib/data/compare')
    const ids = ['a', '', 'b', null as unknown as string]
    const result = buildCompareIds(ids)
    expect(result).not.toContain('')
    expect(result).not.toContain(null)
  })
})

describe('CompareTable', () => {
  it('getCompareData: 2개 단지 ID → ComplexSummary[] 2개 반환', async () => {
    const { getCompareData } = await import('@/lib/data/compare')
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn()
        .mockResolvedValueOnce({ data: { id: 'id1', canonical_name: '래미안A', sgg_code: '48121' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'id2', canonical_name: '래미안B', sgg_code: '48121' }, error: null }),
    }

    const result = await getCompareData(['id1', 'id2'], mockSupabase as never)
    expect(result).toHaveLength(2)
    expect(result[0]?.canonical_name).toBe('래미안A')
  })
})
