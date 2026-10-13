import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { markCronSuccess, markCronFailed, markCronPartial, markCronStatus } from './cron-status'

/**
 * `data_sources` 갱신 결과를 흉내내는 최소 스텁.
 * `.update(...).eq(...).select(...)`가 `{ data, error }`를 돌려주는 체인을 재현한다.
 * markCronFailed 가 먼저 부르는 `.select(...).eq(...).maybeSingle()` 조회도 `prev` 로 흉내낸다.
 */
function stubClient(
  result: { data: unknown[] | null; error: { message: string } | null },
  prev: { consecutive_failures: number } | null = null,
) {
  const select = vi.fn().mockResolvedValue(result)
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const maybeSingle = vi.fn().mockResolvedValue({ data: prev, error: null })
  const readSelect = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }))
  const from = vi.fn(() => ({ update, select: readSelect }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from } as any, from, update, eq, select }
}

describe('cron-status', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('갱신에 성공하면 true를 반환하고 에러 로그를 남기지 않는다', async () => {
    const { client, from } = stubClient({ data: [{ id: 'kapt' }], error: null })

    const ok = await markCronSuccess(client, 'kapt')

    expect(ok).toBe(true)
    expect(from).toHaveBeenCalledWith('data_sources')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('update가 에러를 반환하면 false를 반환하고 에러를 로그에 남긴다', async () => {
    const { client } = stubClient({ data: null, error: { message: 'permission denied' } })

    const ok = await markCronSuccess(client, 'kapt')

    expect(ok).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('permission denied'))
  })

  it('0행이 갱신되면(=해당 id 없음) false를 반환하고 그 사실을 로그에 남긴다', async () => {
    // 이전 구현이 조용히 통과시키던 경로 — data_sources.kapt가 실제로 이 상태였다
    const { client } = stubClient({ data: [], error: null })

    const ok = await markCronSuccess(client, 'does-not-exist')

    expect(ok).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('0행'))
  })

  it('markCronPartial도 동일하게 0행을 감지한다', async () => {
    const { client } = stubClient({ data: [], error: null })

    expect(await markCronPartial(client, 'kapt')).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('markCronStatus는 status에 따라 위임하고 반환값을 그대로 전달한다', async () => {
    const { client, update } = stubClient({ data: [{ id: 'kapt' }], error: null })

    expect(await markCronStatus(client, 'kapt', 'success')).toBe(true)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ last_status: 'success' }))

    expect(await markCronStatus(client, 'kapt', 'partial')).toBe(true)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ last_status: 'partial' }))
  })

  it('markCronSuccess는 last_synced_at을 갱신하고 카운터를 0으로 되돌린다', async () => {
    const { client, update } = stubClient({ data: [{ id: 'kapt' }], error: null })

    await markCronSuccess(client, 'kapt')

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ last_synced_at: expect.any(String), consecutive_failures: 0 }),
    )
  })

  it('markCronFailed는 last_synced_at을 건드리지 않는다 — 매일 실패해도 신선해 보이면 안 된다', async () => {
    const { client, update } = stubClient({ data: [{ id: 'molit_trade' }], error: null }, { consecutive_failures: 2 })

    expect(await markCronFailed(client, 'molit_trade', '차단')).toBe(true)

    const patch = (update.mock.calls as unknown as [Record<string, unknown>][])[0]?.[0]
    expect(patch).not.toHaveProperty('last_synced_at')
    expect(patch).toMatchObject({ last_status: 'failed', consecutive_failures: 3, error_message: '차단' })
  })

  it('markCronFailed는 이전 카운터를 못 읽으면 1부터 센다', async () => {
    const { client, update } = stubClient({ data: [{ id: 'x' }], error: null }, null)

    await markCronFailed(client, 'x')

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ consecutive_failures: 1 }))
  })

  it('markCronPartial은 사유가 없으면 낡은 error_message를 지운다', async () => {
    const { client, update } = stubClient({ data: [{ id: 'kapt' }], error: null })

    await markCronPartial(client, 'kapt')

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ last_status: 'partial', error_message: null }))
  })
})
