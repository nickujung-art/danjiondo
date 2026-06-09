/**
 * seo-hierarchy 데이터 함수 테스트 — Supabase mock
 * Phase 23
 */
import { describe, it, expect, vi } from 'vitest'
import { getSiPageData, getComplexBySlug } from './seo-hierarchy'
import type { SupabaseClient } from '@supabase/supabase-js'

function makeChainMock(returnValue: { data: unknown; error: null | { message: string } }) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'not', 'is', 'order', 'maybeSingle'] as const
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnThis()
  }
  // terminal methods
  ;(chain['maybeSingle'] as ReturnType<typeof vi.fn>).mockResolvedValue(returnValue)
  // last method in chain for list queries — not/order resolves
  const lastChain = { ...chain }
  ;(lastChain['order'] as ReturnType<typeof vi.fn>).mockResolvedValue(returnValue)
  ;(lastChain['not'] as ReturnType<typeof vi.fn>).mockResolvedValue(returnValue)
  return lastChain
}

function makeSupabaseMock(tableData: { data: unknown; error: null }) {
  const chain = makeChainMock(tableData)
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient
}

describe('getSiPageData', () => {
  it('창원시 — guList 반환 + avgPrice 계산 (W1)', async () => {
    const rows = [
      { gu: '성산구', dong: '내동', avg_sale_per_pyeong: 1000 },
      { gu: '성산구', dong: '사파동', avg_sale_per_pyeong: 1100 },
      { gu: '의창구', dong: '팔용동', avg_sale_per_pyeong: 900 },
    ]
    const supabase = makeSupabaseMock({ data: rows, error: null })
    const result = await getSiPageData('창원시', supabase)
    expect(result).not.toBeNull()
    expect(result!.guList.length).toBe(2)
    expect(result!.dongList.length).toBe(0)
    expect(result!.totalComplexes).toBe(3)
    // W1: avgPrice 계산 확인 — 성산구 (1000+1100)/2 = 1050
    const 성산구 = result!.guList.find(g => g.gu === '성산구')
    expect(성산구?.avgPrice).toBe(1050)
  })

  it('김해시 — dongList 반환 + avgPrice 계산 (W1)', async () => {
    const rows = [
      { gu: null, dong: '내동', avg_sale_per_pyeong: 800 },
      { gu: null, dong: '내동', avg_sale_per_pyeong: 900 },
      { gu: null, dong: '삼계동', avg_sale_per_pyeong: 700 },
    ]
    const supabase = makeSupabaseMock({ data: rows, error: null })
    const result = await getSiPageData('김해시', supabase)
    expect(result).not.toBeNull()
    expect(result!.guList.length).toBe(0)
    expect(result!.dongList.length).toBe(2)
    // W1: 내동 avgPrice = (800+900)/2 = 850
    const 내동 = result!.dongList.find(d => d.dong === '내동')
    expect(내동?.avgPrice).toBe(850)
  })

  it('데이터 없으면 null 반환', async () => {
    const supabase = makeSupabaseMock({ data: [], error: null })
    const result = await getSiPageData('없는시', supabase)
    expect(result).toBeNull()
  })
})

describe('getComplexBySlug', () => {
  it('빈 urlSlug → null (Pitfall 6 방어)', async () => {
    const supabase = makeSupabaseMock({ data: null, error: null })
    const result = await getComplexBySlug('', supabase)
    expect(result).toBeNull()
    expect((supabase.from as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it('유효한 slug → 복합 데이터 반환', async () => {
    const complexData = {
      id: 'uuid-1', canonical_name: '대우2차', url_slug: '창원시/성산구/내동/대우2차',
      si: '창원시', gu: '성산구', dong: '내동', status: 'active',
      road_address: null, built_year: 2005, household_count: 300,
      floors_above: 15, heat_type: '지역난방', sgg_code: '38110', lat: 35.2, lng: 128.6,
    }
    const supabase = makeSupabaseMock({ data: complexData, error: null })
    const result = await getComplexBySlug('창원시/성산구/내동/대우2차', supabase)
    expect(result).not.toBeNull()
    expect(result!.url_slug).toBe('창원시/성산구/내동/대우2차')
  })
})
