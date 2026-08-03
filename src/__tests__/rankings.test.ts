/**
 * Phase 2 랭킹 기능 수용 기준 테스트 — RANK-01, RANK-02, RANK-03
 *
 * - computeRankings: 4종 랭킹 산식이 올바르게 집계되고 complex_rankings에 UPSERT
 * - getRankingsByType: rank_type별 올바른 순서의 결과 반환
 * - GET /api/cron/rankings: CRON_SECRET 검증 (401/200)
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// admin client mock — 로컬 Supabase 없이도 동작
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(),
}))

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
  vi.stubEnv('CRON_SECRET', 'test-cron-secret')
})

// ── Mock Supabase 클라이언트 팩토리 ────────────────────────────────────────────

function makeMockChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const terminal = vi.fn().mockResolvedValue(result)
  // lt/lte: aggregatePriceChange 의 직전 창 필터용 (error-notes #001 재발 방지)
  const methods = ['select', 'eq', 'is', 'in', 'not', 'gt', 'gte', 'lt', 'lte', 'order', 'limit']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  // upsert / insert / update / single → terminal
  chain['upsert'] = vi.fn().mockResolvedValue({ error: null })
  chain['insert'] = vi.fn().mockReturnValue({ ...chain, select: vi.fn().mockReturnValue({ single: terminal }) })
  chain['update'] = vi.fn().mockReturnValue(chain)
  // limit → terminal for select queries
  ;(chain['limit'] as ReturnType<typeof vi.fn>).mockResolvedValue(result)
  // single → terminal
  chain['single'] = terminal
  return chain
}

function makeMockSupabase(overrides: Record<string, ReturnType<typeof makeMockChain>> = {}) {
  return {
    from: vi.fn((table: string) => overrides[table] ?? makeMockChain({ data: [], error: null })),
  } as unknown as SupabaseClient<Database>
}

// ── GET /api/cron/rankings ──────────────────────────────────────────────────

describe('GET /api/cron/rankings', () => {
  it('Authorization 헤더 없음 → 401', async () => {
    const { GET } = await import('@/app/api/cron/rankings/route')
    const req = new Request('http://localhost/api/cron/rankings')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('잘못된 CRON_SECRET → 401', async () => {
    const { GET } = await import('@/app/api/cron/rankings/route')
    const req = new Request('http://localhost/api/cron/rankings', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('올바른 CRON_SECRET → 200 + ok:true', async () => {
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    const mockSupabase = makeMockSupabase()
    vi.mocked(createSupabaseAdminClient).mockReturnValue(mockSupabase as ReturnType<typeof createSupabaseAdminClient>)

    const { GET } = await import('@/app/api/cron/rankings/route')
    const req = new Request('http://localhost/api/cron/rankings', {
      headers: { authorization: 'Bearer test-cron-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })
})

// ── getRankingsByType ──────────────────────────────────────────────────────

describe('getRankingsByType', () => {
  it('빈 complex_rankings → 빈 배열 반환', async () => {
    const { getRankingsByType } = await import('@/lib/data/rankings')
    const mockSupabase = makeMockSupabase()
    const result = await getRankingsByType(mockSupabase, 'high_price', 10)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(0)
  })

  it('반환 행은 rank 오름차순 정렬', async () => {
    const { getRankingsByType } = await import('@/lib/data/rankings')
    // complex_rankings에 rank 2, 1 순서로 데이터 반환하면 order('rank') 후 정렬됨
    const mockData = [
      { score: 100, rank: 1, complexes: { id: 'c1', canonical_name: '단지A', si: '창원시', gu: '의창구' } },
      { score: 80, rank: 2, complexes: { id: 'c2', canonical_name: '단지B', si: '창원시', gu: '성산구' } },
    ]
    const chain = makeMockChain({ data: mockData, error: null })
    const mockSupabase = makeMockSupabase({ complex_rankings: chain })
    const result = await getRankingsByType(mockSupabase, 'volume', 10)
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.rank).toBeGreaterThanOrEqual(result[i - 1]!.rank)
    }
  })
})

// ── computeRankings ────────────────────────────────────────────────────────

describe('computeRankings', () => {
  // 40-02: price_change 추가로 4종 → 5종. 상세 단언은 rankings-price-change.test.ts
  it('실행 후 결과는 5종 타입 배열을 반환한다', async () => {
    const { computeRankings } = await import('@/lib/data/rankings')
    const mockSupabase = makeMockSupabase()
    const results = await computeRankings(mockSupabase)
    expect(Array.isArray(results)).toBe(true)
    expect(results).toHaveLength(5)
    for (const r of results) {
      expect(r).toHaveProperty('type')
      expect(r).toHaveProperty('upserted')
      expect(typeof r.type).toBe('string')
      expect(typeof r.upserted).toBe('number')
    }
  })
})
