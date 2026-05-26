import { describe, it, expect, vi } from 'vitest'
import { getComplexesForMap } from './complexes-map'

vi.mock('server-only', () => ({}))

function makeChain(resolvedValue: { data: unknown; error: unknown }) {
  const resolved = Promise.resolve(resolvedValue)
  const chainObj: Record<string, unknown> = {}
  Object.assign(chainObj, {
    not:   vi.fn().mockReturnValue(chainObj),
    in:    vi.fn().mockReturnValue(chainObj),
    gte:   vi.fn().mockReturnValue(chainObj),
    lte:   vi.fn().mockReturnValue(chainObj),
    or:    vi.fn().mockReturnValue(chainObj),
    range: vi.fn().mockReturnValue(chainObj),
    then:  resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
  })
  return chainObj
}

describe('getComplexesForMap', () => {
  it('Test 1: 쿼리에 .not("status", "in", "(demolished,merged,rental)") 체인이 포함되어야 한다', async () => {
    const chainObj = makeChain({ data: [], error: null })
    const notSpy = chainObj.not as ReturnType<typeof vi.fn>

    const mockSupabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(chainObj) }),
    } as unknown as Parameters<typeof getComplexesForMap>[1]

    await getComplexesForMap(['48121'], mockSupabase)

    expect(notSpy).toHaveBeenCalledWith('status', 'in', '(demolished,merged,rental)')
  })

  it('Test 2: error 반환 시 Error를 throw한다', async () => {
    const chainObj = makeChain({ data: null, error: { message: 'DB error' } })

    const mockSupabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(chainObj) }),
    } as unknown as Parameters<typeof getComplexesForMap>[1]

    await expect(getComplexesForMap(['48121'], mockSupabase)).rejects.toThrow(
      'getComplexesForMap failed',
    )
  })
})
