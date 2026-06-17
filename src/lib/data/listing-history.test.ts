/**
 * listing-history 테스트 — getListingPriceHistory()
 *
 * Phase 25 Plan 03 Task 1 (TDD RED)
 */
import { describe, it, expect, vi } from 'vitest'
import { getListingPriceHistory } from './listing-history'
import type { ListingPricePoint } from './listing-history'

// Supabase 클라이언트 mock 헬퍼
function makeSupabaseMock(rows: ListingPricePoint[]) {
  const query = {
    select:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    gte:     vi.fn().mockReturnThis(),
    order:   vi.fn().mockResolvedValue({ data: rows, error: null }),
  }

  const from = vi.fn().mockReturnValue(query)

  return { from } as unknown as Parameters<typeof getListingPriceHistory>[1]
}

describe('getListingPriceHistory', () => {
  it('데이터 없을 때 빈 배열 반환', async () => {
    const supabase = makeSupabaseMock([])
    const result = await getListingPriceHistory('complex-1', supabase)
    expect(result).toEqual([])
  })

  it('데이터 있을 때 ListingPricePoint 배열 반환', async () => {
    const rows: ListingPricePoint[] = [
      { recorded_date: '2025-01-15', price_per_py: 1200 },
      { recorded_date: '2025-02-20', price_per_py: 1250 },
    ]
    const supabase = makeSupabaseMock(rows)
    const result = await getListingPriceHistory('complex-1', supabase)
    expect(result).toHaveLength(2)
    expect(result[0]?.recorded_date).toBe('2025-01-15')
    expect(result[0]?.price_per_py).toBe(1200)
  })

  it('source=naver .eq 쿼리 필터 적용 확인', async () => {
    const rows: ListingPricePoint[] = [
      { recorded_date: '2025-03-10', price_per_py: 1300 },
    ]
    const query = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      gte:    vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: rows, error: null }),
    }
    const from = vi.fn().mockReturnValue(query)
    const supabase = { from } as unknown as Parameters<typeof getListingPriceHistory>[1]

    await getListingPriceHistory('complex-1', supabase)

    // .eq('source', 'naver') 호출 검증
    const eqCalls = query.eq.mock.calls
    const sourceCall = eqCalls.find((c: unknown[]) => c[0] === 'source' && c[1] === 'naver')
    expect(sourceCall).toBeDefined()
  })

  it('complex_id .eq 쿼리 필터 적용 확인', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      gte:    vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const from = vi.fn().mockReturnValue(query)
    const supabase = { from } as unknown as Parameters<typeof getListingPriceHistory>[1]

    await getListingPriceHistory('test-complex-uuid', supabase)

    const eqCalls = query.eq.mock.calls
    const complexCall = eqCalls.find((c: unknown[]) => c[0] === 'complex_id' && c[1] === 'test-complex-uuid')
    expect(complexCall).toBeDefined()
  })

  it('data가 null일 때 빈 배열 반환 (Supabase null 방어)', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      gte:    vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    const from = vi.fn().mockReturnValue(query)
    const supabase = { from } as unknown as Parameters<typeof getListingPriceHistory>[1]

    const result = await getListingPriceHistory('complex-1', supabase)
    expect(result).toEqual([])
  })
})
