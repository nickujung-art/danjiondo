import { describe, it, expect, vi } from 'vitest'
import {
  getActiveListings,
  getActiveListingCount,
  getRedevelopmentComplexes,
  getNewBuiltComplexes,
} from './presale'

vi.mock('server-only', () => ({}))

// Chainable mock builder
function createMockChain(returnValue: { data?: unknown; count?: number | null; error?: null }) {
  const chain: {
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    not: ReturnType<typeof vi.fn>
    gte: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
    in: ReturnType<typeof vi.fn>
  } = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    not: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(returnValue)),
    in: vi.fn(() => Promise.resolve({ data: [], error: null })),
  }
  return chain
}

describe('getActiveListings (PRESALE-03 Tier 1)', () => {
  it('returns only rows where pblanc_no IS NOT NULL and is_active=true', async () => {
    const chain = createMockChain({ data: [], error: null })
    const supabase = { from: vi.fn(() => chain) } as unknown as Parameters<typeof getActiveListings>[0]

    await getActiveListings(supabase)

    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
    expect(chain.not).toHaveBeenCalledWith('pblanc_no', 'is', null)
    expect(chain.order).toHaveBeenCalledWith('rcept_bgnde', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(20)
  })

  it('orders by rcept_bgnde DESC', async () => {
    const chain = createMockChain({ data: [], error: null })
    const supabase = { from: vi.fn(() => chain) } as unknown as Parameters<typeof getActiveListings>[0]

    await getActiveListings(supabase)

    expect(chain.order).toHaveBeenCalledWith('rcept_bgnde', { ascending: false })
  })

  it('selects all 11 cheongyak columns + id', async () => {
    const chain = createMockChain({ data: [], error: null })
    const supabase = { from: vi.fn(() => chain) } as unknown as Parameters<typeof getActiveListings>[0]

    await getActiveListings(supabase)

    const selectCall = (chain.select.mock.calls[0] as unknown[])[0] as string
    const cols = ['id', 'pblanc_no', 'pblanc_nm', 'region', 'supply_region', 'supply_count',
      'rcept_bgnde', 'rcept_endde', 'mvn_prearnge_ym', 'competition_rate', 'hssply_adres', 'complex_id']
    for (const col of cols) {
      expect(selectCall).toContain(col)
    }
  })
})

describe('getRedevelopmentComplexes (PRESALE-03 Tier 2)', () => {
  it('returns only complexes with status=in_redevelopment', async () => {
    const chain = createMockChain({ data: [], error: null })
    const supabase = { from: vi.fn(() => chain) } as unknown as Parameters<typeof getRedevelopmentComplexes>[0]

    await getRedevelopmentComplexes(supabase)

    expect(chain.eq).toHaveBeenCalledWith('status', 'in_redevelopment')
  })

  it('includes predecessor_id and successor_id columns', async () => {
    const chain = createMockChain({ data: [], error: null })
    const supabase = { from: vi.fn(() => chain) } as unknown as Parameters<typeof getRedevelopmentComplexes>[0]

    await getRedevelopmentComplexes(supabase)

    const selectCall = (chain.select.mock.calls[0] as unknown[])[0] as string
    expect(selectCall).toContain('predecessor_id')
    expect(selectCall).toContain('successor_id')
  })
})

describe('getNewBuiltComplexes (PRESALE-03 Tier 3)', () => {
  it('returns only complexes with built_year >= 2021 AND status=active', async () => {
    const chain = createMockChain({ data: [], error: null })
    const supabase = { from: vi.fn(() => chain) } as unknown as Parameters<typeof getNewBuiltComplexes>[0]

    await getNewBuiltComplexes(supabase)

    expect(chain.eq).toHaveBeenCalledWith('status', 'active')
    expect(chain.gte).toHaveBeenCalledWith('built_year', 2021)
  })

  it('orders by built_year DESC', async () => {
    const chain = createMockChain({ data: [], error: null })
    const supabase = { from: vi.fn(() => chain) } as unknown as Parameters<typeof getNewBuiltComplexes>[0]

    await getNewBuiltComplexes(supabase)

    expect(chain.order).toHaveBeenCalledWith('built_year', { ascending: false })
  })
})

describe('getActiveListingCount (PRESALE-03 landing badge)', () => {
  it('returns count of active cheongyak listings', async () => {
    const chain = createMockChain({ count: 5, error: null })
    // For head:true queries, limit is not called — Promise resolves after select chain
    // Override: select returns the final promise directly when called with { count, head }
    const countChain = {
      select: vi.fn(() => countChain),
      eq: vi.fn(() => countChain),
      not: vi.fn(() => Promise.resolve({ count: 5, error: null })),
    }
    const supabase = { from: vi.fn(() => countChain) } as unknown as Parameters<typeof getActiveListingCount>[0]

    const result = await getActiveListingCount(supabase)

    expect(countChain.eq).toHaveBeenCalledWith('is_active', true)
    expect(countChain.not).toHaveBeenCalledWith('pblanc_no', 'is', null)
    expect(result).toBe(5)
  })

  it('returns 0 when count is null', async () => {
    const countChain = {
      select: vi.fn(() => countChain),
      eq: vi.fn(() => countChain),
      not: vi.fn(() => Promise.resolve({ count: null, error: null })),
    }
    const supabase = { from: vi.fn(() => countChain) } as unknown as Parameters<typeof getActiveListingCount>[0]

    const result = await getActiveListingCount(supabase)

    expect(result).toBe(0)
  })
})
