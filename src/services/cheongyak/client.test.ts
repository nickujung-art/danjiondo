import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/api/retry', () => ({
  withRetry: (fn: () => unknown) => fn(),
}))

import { fetchCheongyakList, fetchCompetitionRate } from './client'

const mockOdcloudResponse = (data: unknown[], totalCount = data.length) =>
  Promise.resolve({
    ok: true,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({ totalCount, data }),
  })

describe('fetchCheongyakList (PRESALE-01)', () => {
  const ORIGINAL_KEY = process.env.MOLIT_API_KEY
  beforeEach(() => { delete process.env.MOLIT_API_KEY })
  afterEach(() => {
    if (ORIGINAL_KEY) process.env.MOLIT_API_KEY = ORIGINAL_KEY
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('throws when MOLIT_API_KEY missing', async () => {
    await expect(fetchCheongyakList()).rejects.toThrow('MOLIT_API_KEY not set')
  })

  it('calls odcloud.kr URL with serviceKey + page + returnType', async () => {
    process.env.MOLIT_API_KEY = 'test-key'
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      capturedUrl = url
      return mockOdcloudResponse([])
    }))
    await fetchCheongyakList()
    expect(capturedUrl).toContain('api.odcloud.kr')
    expect(capturedUrl).toContain('ApplyhomeInfoDetailSvc')
    expect(capturedUrl).toContain('serviceKey=test-key')
    expect(capturedUrl).toContain('returnType=json')
    expect(capturedUrl).toContain('page=1')
  })

  it('filters 창원·김해 by HSSPLY_ADRES', async () => {
    process.env.MOLIT_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockOdcloudResponse([
      { PBLANC_NO: 'A', HOUSE_NM: '창원파크', HSSPLY_ADRES: '경상남도 창원시 의창구 ...' },
      { PBLANC_NO: 'B', HOUSE_NM: '진주자이', HSSPLY_ADRES: '경상남도 진주시 ...' },
      { PBLANC_NO: 'C', HOUSE_NM: '김해푸르지오', HSSPLY_ADRES: '경상남도 김해시 장유로 ...' },
    ])))
    const result = await fetchCheongyakList()
    expect(result).toHaveLength(2)
    expect(result[0]?.PBLANC_NO).toBe('A')
    expect(result[1]?.PBLANC_NO).toBe('C')
  })

  it('throws on res.ok === false', async () => {
    process.env.MOLIT_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    }))
    await expect(fetchCheongyakList()).rejects.toThrow('Cheongyak API 500')
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

  it('returns null when API returns empty data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockOdcloudResponse([])))
    const result = await fetchCompetitionRate('2026000123')
    expect(result).toBeNull()
  })

  it('returns max CMPET_RATE across multiple house types', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockOdcloudResponse([
      { PBLANC_NO: '2026000123', CMPET_RATE: '12.3', HOUSE_TY: '59A' },
      { PBLANC_NO: '2026000123', CMPET_RATE: '45.6', HOUSE_TY: '84B' },
      { PBLANC_NO: '2026000123', CMPET_RATE: '7.8',  HOUSE_TY: '84A' },
    ])))
    const result = await fetchCompetitionRate('2026000123')
    expect(result).toBe(45.6)
  })
})
