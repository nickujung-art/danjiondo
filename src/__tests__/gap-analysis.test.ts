/**
 * Phase 20 갭투자 분석 단위 테스트 — GAP-06, GAP-07
 *
 * - GAP-06: getComplexGapStats — 없는 complex_id → null 반환, 데이터 있음 → GapStatsRow 반환
 * - GAP-07: GapAnalysisCard — null 데이터 → null 렌더링 (숨김)
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
})

function makeMockChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const terminal = vi.fn().mockResolvedValue(result)
  const methods = ['select', 'eq', 'is', 'in', 'not', 'order', 'limit']
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain)
  chain['maybeSingle'] = terminal
  chain['single'] = terminal
  ;(chain['limit'] as ReturnType<typeof vi.fn>).mockResolvedValue(result)
  return chain
}

function makeMockSupabase(overrides: Record<string, ReturnType<typeof makeMockChain>> = {}) {
  return {
    from: vi.fn((table: string) => overrides[table] ?? makeMockChain({ data: null, error: null })),
  } as unknown as SupabaseClient<Database>
}

// ── GAP-06: getComplexGapStats ─────────────────────────────────────────────────

describe('getComplexGapStats', () => {
  it('GAP-06: 데이터 없는 단지 → null 반환', async () => {
    const { getComplexGapStats } = await import('@/lib/data/gap-analysis')
    const mockSupabase = makeMockSupabase()
    const result = await getComplexGapStats('nonexistent-id', mockSupabase)
    expect(result).toBeNull()
  })

  it('GAP-06: 데이터 있는 단지 → ComplexGapStatsResult 반환', async () => {
    const { getComplexGapStats } = await import('@/lib/data/gap-analysis')
    const mockRow = {
      complex_id: 'valid-id',
      median_sale_price: 35000,
      median_jeonse_price: 22000,
      gap_amount: 13000,
      gap_ratio: '37.1',
      jeonse_ratio: '62.9',
      risk_level: 'safe',
      sale_count: 5,
      jeonse_count: 4,
      window_months: 12,
      computed_at: '2026-05-28T00:00:00Z',
    }
    const chain = makeMockChain({ data: mockRow, error: null })
    const mockSupabase = makeMockSupabase({ complex_gap_stats: chain })
    const result = await getComplexGapStats('valid-id', mockSupabase)
    expect(result).not.toBeNull()
    expect(result?.riskLevel).toBe('safe')
    expect(result?.gapRatio).toBeCloseTo(37.1, 1)
    expect(result?.saleCount).toBe(5)
    expect(result?.gapAmount).toBe(13000)
  })
})
