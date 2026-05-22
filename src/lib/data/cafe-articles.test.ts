import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('getCafeArticlesByComplex', () => {
  it('빈 결과(data=null)를 빈 배열로 반환한다', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
      }),
    }
    const { getCafeArticlesByComplex } = await import('./cafe-articles')
    const result = await getCafeArticlesByComplex('test-id', mockSupabase as never)
    expect(result).toEqual([])
  })
})

describe('ingestCafeArticles', () => {
  it('빈 배열이면 0을 반환하고 DB를 호출하지 않는다', async () => {
    const mockSupabase = { from: vi.fn() }
    const { ingestCafeArticles } = await import('./cafe-articles')
    const result = await ingestCafeArticles('test-id', [], mockSupabase as never)
    expect(result).toBe(0)
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })
})
