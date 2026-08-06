import { describe, expect, it, vi } from 'vitest'
import { createComplexIdLookup, matchComplexId } from './complex-id-lookup'

/** rpc()가 순서대로 응답을 돌려주는 최소 스텁 */
function stubSupabase(responses: Array<{ data?: unknown; error?: { message: string } | null }>) {
  const rpc = vi.fn(async () => {
    const next = responses.shift() ?? { data: [], error: null }
    return { data: next.data ?? null, error: next.error ?? null }
  })
  return { client: { rpc } as never, rpc }
}

const ARGS = { sggCode: '48125', nameNormalized: '마린애시앙부영', umdNm: '월영동' }

describe('matchComplexId', () => {
  it('returns the top match when similarity clears the threshold', async () => {
    // Arrange
    const { client } = stubSupabase([{ data: [{ id: 'c-1', trgm_sim: 0.95 }] }])

    // Act
    const result = await matchComplexId(client, ARGS, 0.9)

    // Assert
    expect(result).toBe('c-1')
  })

  it('returns null when the top match falls below the threshold', async () => {
    const { client } = stubSupabase([{ data: [{ id: 'c-1', trgm_sim: 0.82 }] }])
    expect(await matchComplexId(client, ARGS, 0.9)).toBeNull()
  })

  it('returns null for a genuine empty result', async () => {
    // Arrange — 진짜 "등록된 단지 없음". 이건 에러가 아니다.
    const { client } = stubSupabase([{ data: [] }])

    // Act / Assert
    expect(await matchComplexId(client, ARGS, 0.9)).toBeNull()
  })

  it('retries once before giving up', async () => {
    // Arrange — 일시적 실패는 흡수해야 한다
    const { client, rpc } = stubSupabase([
      { error: { message: 'canceling statement due to statement timeout' } },
      { data: [{ id: 'c-1', trgm_sim: 0.97 }] },
    ])

    // Act
    const result = await matchComplexId(client, ARGS, 0.9)

    // Assert
    expect(result).toBe('c-1')
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('throws instead of reporting "no match" when the RPC keeps failing', async () => {
    // Arrange — 이 구분이 이 모듈의 존재 이유다. 예전 구현은 여기서 null을 돌려주어
    // 거래가 complex_id=null로 적재됐고, 화면에서 "모르는 건물"과 구분되지 않았다.
    const { client } = stubSupabase([
      { error: { message: 'boom' } },
      { error: { message: 'boom' } },
    ])

    // Act / Assert
    await expect(matchComplexId(client, ARGS, 0.9)).rejects.toThrow(/match_complex_by_admin failed/)
  })

  it('names the complex in the error so the log points somewhere', async () => {
    const { client } = stubSupabase([{ error: { message: 'boom' } }, { error: { message: 'boom' } }])
    await expect(matchComplexId(client, ARGS, 0.9)).rejects.toThrow(/마린애시앙부영/)
  })
})

describe('createComplexIdLookup', () => {
  it('caches a successful lookup instead of re-querying', async () => {
    // Arrange
    const { client, rpc } = stubSupabase([{ data: [{ id: 'c-1', trgm_sim: 0.95 }] }])
    const lookup = createComplexIdLookup(client, 0.9)

    // Act
    const first = await lookup('48125', '마린애시앙부영', '월영동')
    const second = await lookup('48125', '마린애시앙부영', '월영동')

    // Assert
    expect([first, second]).toEqual(['c-1', 'c-1'])
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('caches a genuine null so unknown buildings are not re-queried', async () => {
    const { client, rpc } = stubSupabase([{ data: [] }])
    const lookup = createComplexIdLookup(client, 0.9)

    expect(await lookup('48125', '무명빌라', '월영동')).toBeNull()
    expect(await lookup('48125', '무명빌라', '월영동')).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('does NOT cache a failure — one transient error must not detach a whole complex', async () => {
    // Arrange — 2026-05-26 사고의 핵심. 예전엔 실패를 null로 캐시해서 캐시 키 하나가
    // 오염되면 그 단지의 남은 거래가 전부 미연결로 적재됐다(마린애시앙 143건).
    const { client, rpc } = stubSupabase([
      { error: { message: 'boom' } },
      { error: { message: 'boom' } },
      { data: [{ id: 'c-1', trgm_sim: 0.95 }] },
    ])
    const lookup = createComplexIdLookup(client, 0.9)

    // Act — 첫 호출은 던지고, 두 번째 호출은 캐시에 막히지 않고 다시 시도해야 한다
    await expect(lookup('48125', '마린애시앙부영', '월영동')).rejects.toThrow()
    const recovered = await lookup('48125', '마린애시앙부영', '월영동')

    // Assert
    expect(recovered).toBe('c-1')
    expect(rpc).toHaveBeenCalledTimes(3)
  })

  it('keys the cache by dong so same-named complexes stay separate', async () => {
    // Arrange — "현대"처럼 흔한 이름은 동이 다르면 다른 단지다
    const { client, rpc } = stubSupabase([
      { data: [{ id: 'jungni', trgm_sim: 0.95 }] },
      { data: [{ id: 'samgye', trgm_sim: 0.95 }] },
    ])
    const lookup = createComplexIdLookup(client, 0.9)

    // Act
    const a = await lookup('48127', '현대', '내서읍 중리')
    const b = await lookup('48127', '현대', '내서읍 삼계리')

    // Assert
    expect([a, b]).toEqual(['jungni', 'samgye'])
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})
