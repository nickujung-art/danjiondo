import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { markCronSuccess, markCronPartial, markCronStatus } from './cron-status'

/**
 * `data_sources` 갱신 결과를 흉내내는 최소 스텁.
 * `.update(...).eq(...).select(...)`가 `{ data, error }`를 돌려주는 체인을 재현한다.
 */
function stubClient(result: { data: unknown[] | null; error: { message: string } | null }) {
  const select = vi.fn().mockResolvedValue(result)
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
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
})
