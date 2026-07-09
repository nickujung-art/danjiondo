import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { detectPotentialDuplicate } from './complex-matching'

function makeSupabaseMock(rpcImpl: (name: string, params: unknown) => Promise<{ data: unknown; error: unknown }>) {
  const rpc = vi.fn().mockImplementation(rpcImpl)
  return { rpc } as unknown as SupabaseClient
}

describe('detectPotentialDuplicate', () => {
  it('coordX/coordY가 undefined면 빈 배열 반환 + rpc 미호출', async () => {
    const rpc = vi.fn()
    const supabase = { rpc } as unknown as SupabaseClient

    const result = await detectPotentialDuplicate(supabase, {
      coordX: undefined,
      coordY: undefined,
      nameNormalized: '테스트아파트',
      kaptCode: 'K_TEST',
    })

    expect(result).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('실좌표(부산) 존재 시 RPC를 정확한 인자로 호출하고 후보 배열을 반환한다', async () => {
    const mockCandidates = [
      { id: 'complex-1', canonical_name: '해운대아이파크', kapt_code: 'K_OTHER', dist_m: 12.3 },
    ]
    const supabase = makeSupabaseMock(async () => ({ data: mockCandidates, error: null }))

    const result = await detectPotentialDuplicate(supabase, {
      coordX: 129.16,
      coordY: 35.16,
      nameNormalized: '해운대아이파크',
      kaptCode: 'K_NEW',
    })

    expect(result).toEqual(mockCandidates)
    expect(supabase.rpc).toHaveBeenCalledWith('find_nearby_similar_complexes', {
      p_lat: 35.16,
      p_lng: 129.16,
      p_name_normalized: '해운대아이파크',
      p_exclude_kapt_code: 'K_NEW',
      p_radius_m: 30,
      p_similarity_threshold: 0.4,
    })
  })

  it('RPC error 시 빈 배열 반환 (throw 안 함)', async () => {
    const supabase = makeSupabaseMock(async () => ({ data: null, error: { message: 'rpc failed' } }))

    const result = await detectPotentialDuplicate(supabase, {
      coordX: 129.16,
      coordY: 35.16,
      nameNormalized: '테스트아파트',
      kaptCode: 'K_NEW',
    })

    expect(result).toEqual([])
  })
})
