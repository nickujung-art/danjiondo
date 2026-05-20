import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// withRetry는 패스스루로 mock — 테스트에서 재시도 루프 방지
vi.mock('@/lib/api/retry', () => ({
  withRetry: (fn: () => unknown) => fn(),
}))

import { fetchCheongyakList, fetchCompetitionRate } from './client'

describe('fetchCheongyakList (PRESALE-01)', () => {
  const ORIGINAL_KEY = process.env.MOLIT_API_KEY
  beforeEach(() => { delete process.env.MOLIT_API_KEY })
  afterEach(() => {
    if (ORIGINAL_KEY) process.env.MOLIT_API_KEY = ORIGINAL_KEY
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('throws when MOLIT_API_KEY missing', async () => {
    await expect(fetchCheongyakList('4812500000')).rejects.toThrow('MOLIT_API_KEY not set')
  })

  it('calls expected URL with RoadNmSggCd + _type=json', async () => {
    process.env.MOLIT_API_KEY = 'test-key'
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      capturedUrl = url
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          response: {
            body: {
              totalCount: 0,
              items: { item: [] },
            },
          },
        }),
      })
    }))
    await fetchCheongyakList('4812500000')
    expect(capturedUrl).toContain('RoadNmSggCd=4812500000')
    expect(capturedUrl).toContain('_type=json')
    expect(capturedUrl).toContain('numOfRows=100')
    expect(capturedUrl).toContain('pageNo=1')
    expect(capturedUrl).toContain('ServiceKey=test-key')
  })

  it('parses camelCase response into CheongyakItem[]', async () => {
    process.env.MOLIT_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        response: {
          body: {
            totalCount: 2,
            items: {
              item: [
                { pblancNo: 'A', pblancNm: 'X' },
                { pblancNo: 'B', pblancNm: 'Y' },
              ],
            },
          },
        },
      }),
    }))
    const result = await fetchCheongyakList('4812500000')
    expect(result).toHaveLength(2)
    expect(result[0]?.pblancNo).toBe('A')
    expect(result[1]?.pblancNm).toBe('Y')
  })

  it('throws on res.ok === false', async () => {
    process.env.MOLIT_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }))
    await expect(fetchCheongyakList('4812500000')).rejects.toThrow('Cheongyak API')
  })
})

describe('fetchCompetitionRate (PRESALE-02)', () => {
  const ORIGINAL_KEY = process.env.MOLIT_API_KEY
  beforeEach(() => { process.env.MOLIT_API_KEY = 'test-key' })
  afterEach(() => {
    if (ORIGINAL_KEY) process.env.MOLIT_API_KEY = ORIGINAL_KEY
    else delete process.env.MOLIT_API_KEY
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns null when API returns empty items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        response: {
          body: {
            totalCount: 0,
            items: { item: [] },
          },
        },
      }),
    }))
    const result = await fetchCompetitionRate('2026000123')
    expect(result).toBeNull()
  })

  it('aggregates multiple houseTy rows into single max competition rate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        response: {
          body: {
            totalCount: 3,
            items: {
              item: [
                { pblancNo: '2026000123', gnrlRnk1CrsplApplCnt: 12.3, houseTy: '59A' },
                { pblancNo: '2026000123', gnrlRnk1CrsplApplCnt: 45.6, houseTy: '84B' },
                { pblancNo: '2026000123', gnrlRnk1CrsplApplCnt: 7.8, houseTy: '84A' },
              ],
            },
          },
        },
      }),
    }))
    const result = await fetchCompetitionRate('2026000123')
    expect(result).toBe(45.6)
  })
})
