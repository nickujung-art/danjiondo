import { describe, it, expect, vi, beforeEach } from 'vitest'

// MAP-03: GET /api/complexes/[id]/map-panel 응답 구조 테스트

vi.mock('@/lib/data/map-panel', () => ({
  getMapPanelData: vi.fn(),
}))

vi.mock('@/lib/supabase/readonly', () => ({
  createReadonlyClient: vi.fn(() => ({})),
}))

import { GET } from './route'
import { getMapPanelData } from '@/lib/data/map-panel'

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const MOCK_DATA = {
  id:                  VALID_UUID,
  canonical_name:      '창원 e편한세상',
  si:                  '경남',
  gu:                  '창원시',
  sgg_code:            '48123',
  avg_sale_per_pyeong: 1200,
  household_count:     500,
  built_year:          2015,
  recent_trades:       [],
  hagwon_grade:        'A+',
  detail_url:          `/complexes/${VALID_UUID}`,
}

async function callGET(id: string) {
  return GET(new Request('http://localhost'), {
    params: Promise.resolve({ id }),
  })
}

describe('GET /api/complexes/[id]/map-panel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('유효한 UUID로 요청 시 단지 데이터를 반환한다', async () => {
    vi.mocked(getMapPanelData).mockResolvedValue(MOCK_DATA)
    const res = await callGET(VALID_UUID)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.canonical_name).toBe('창원 e편한세상')
    expect(body.hagwon_grade).toBe('A+')
  })

  it('잘못된 UUID 형식으로 요청 시 400을 반환한다', async () => {
    const res = await callGET('not-a-uuid')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid id')
  })

  it('존재하지 않는 ID로 요청 시 404를 반환한다', async () => {
    vi.mocked(getMapPanelData).mockResolvedValue(null)
    const res = await callGET(VALID_UUID)
    expect(res.status).toBe(404)
  })

  it('getMapPanelData가 throw하면 500을 반환한다', async () => {
    vi.mocked(getMapPanelData).mockRejectedValue(new Error('db error'))
    const res = await callGET(VALID_UUID)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('db error')
  })
})
