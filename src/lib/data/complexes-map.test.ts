import { describe, it, expect, vi } from 'vitest'
import { getComplexesForMap } from './complexes-map'

vi.mock('server-only', () => ({}))

describe('getComplexesForMap', () => {
  it('Test 1: 쿼리에 .not("status", "in", "(demolished,merged,rental)") 체인이 포함되어야 한다', async () => {
    const notSpy = vi.fn()

    // Supabase builder는 thenable — await 시 then()이 호출됨
    const resolved = Promise.resolve({ data: [], error: null })
    const chainObj: Record<string, unknown> = {}
    Object.assign(chainObj, {
      not: notSpy.mockReturnValue(chainObj),
      in:  vi.fn().mockReturnValue(chainObj),
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
    })

    const mockSupabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(chainObj) }),
    } as unknown as Parameters<typeof getComplexesForMap>[1]

    await getComplexesForMap(['48121'], mockSupabase)

    expect(notSpy).toHaveBeenCalledWith('status', 'in', '(demolished,merged,rental)')
  })

  it('Test 2: error 반환 시 Error를 throw한다', async () => {
    const notSpy = vi.fn()

    const resolved = Promise.resolve({ data: null, error: { message: 'DB error' } })
    const chainObj: Record<string, unknown> = {}
    Object.assign(chainObj, {
      not: notSpy.mockReturnValue(chainObj),
      in:  vi.fn().mockReturnValue(chainObj),
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
    })

    const mockSupabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(chainObj) }),
    } as unknown as Parameters<typeof getComplexesForMap>[1]

    await expect(getComplexesForMap(['48121'], mockSupabase)).rejects.toThrow(
      'getComplexesForMap failed',
    )
  })
})
