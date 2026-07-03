/**
 * regions.ts 데이터 함수 테스트 — Supabase mock
 * Phase 33-00
 */
import { describe, it, expect, vi } from 'vitest'
import { getActiveSggCodes, getActiveCityNames } from './regions'
import type { SupabaseClient } from '@supabase/supabase-js'

function makeChainMock(returnValue: { data: unknown; error: null | { message: string } }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'order'] as const
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnThis()
  }
  // terminal method — order() resolves for getActiveSggCodes, eq() resolves for getActiveCityNames
  ;(chain['order'] as ReturnType<typeof vi.fn>).mockResolvedValue(returnValue)
  ;(chain['eq'] as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    ...chain,
    then: (resolve: (v: typeof returnValue) => void) => resolve(returnValue),
  }))
  return chain
}

function makeSupabaseMock(returnValue: { data: unknown; error: null | { message: string } }) {
  const chain = makeChainMock(returnValue)
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient
}

describe('getActiveSggCodes', () => {
  it('is_active=true인 sgg_code 목록을 반환한다', async () => {
    const supabase = makeSupabaseMock({
      data: [{ sgg_code: '48121' }, { sgg_code: '48250' }],
      error: null,
    })
    const result = await getActiveSggCodes(supabase)
    expect(result).toEqual(['48121', '48250'])
  })

  it('error 발생 시 throw한다', async () => {
    const supabase = makeSupabaseMock({ data: null, error: { message: 'db error' } })
    await expect(getActiveSggCodes(supabase)).rejects.toThrow('regions 조회 실패')
  })
})

describe('getActiveCityNames', () => {
  it('si 접미사(시/군)를 제거하고 중복을 제거하여 반환한다', async () => {
    const supabase = makeSupabaseMock({
      data: [{ si: '창원시' }, { si: '창원시' }, { si: '의령군' }],
      error: null,
    })
    const result = await getActiveCityNames(supabase)
    expect(result).toEqual(['창원', '의령'])
  })

  it('error 발생 시 throw한다', async () => {
    const supabase = makeSupabaseMock({ data: null, error: { message: 'db error' } })
    await expect(getActiveCityNames(supabase)).rejects.toThrow('regions 조회 실패')
  })
})
