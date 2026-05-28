/**
 * Phase 20 갭투자 통계 수용 기준 테스트 — GAP-01 ~ GAP-05
 *
 * - GAP-01: computeRiskLevel 경계값 검증 (safe/caution/danger)
 * - GAP-02: RPC 빈 배열이면 upsert 호출 없음
 * - GAP-03: RPC 에러 → errors 배열에 메시지 포함, complexesUpdated=0
 * - GAP-04: GET /api/cron/daily Authorization 없음 → 401
 * - GAP-05: 올바른 CRON_SECRET → 200 + ok 필드
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
  vi.stubEnv('CRON_SECRET', 'test-cron-secret')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
})

// ── Mock Supabase 클라이언트 팩토리 ────────────────────────────────────────────

function makeMockChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const terminal = vi.fn().mockResolvedValue(result)
  const methods = ['select', 'eq', 'is', 'in', 'not', 'gt', 'gte', 'order', 'limit']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain['upsert'] = vi.fn().mockResolvedValue({ error: null })
  chain['insert'] = vi.fn().mockReturnValue({ ...chain, select: vi.fn().mockReturnValue({ single: terminal }) })
  chain['update'] = vi.fn().mockReturnValue(chain)
  ;(chain['limit'] as ReturnType<typeof vi.fn>).mockResolvedValue(result)
  chain['single'] = terminal
  return chain
}

function makeMockSupabase(overrides: Record<string, ReturnType<typeof makeMockChain>> = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
  return {
    from: vi.fn((table: string) => overrides[table] ?? makeMockChain({ data: [], error: null })),
    rpc,
  } as unknown as SupabaseClient<Database> & { rpc: typeof rpc }
}

// ── GAP-01: computeRiskLevel 경계값 ───────────────────────────────────────────

describe('computeRiskLevel', () => {
  it('GAP-01: 갭 비율 40% 미만 → safe', async () => {
    const { computeRiskLevel } = await import('@/lib/data/gap-stats')
    expect(computeRiskLevel(0)).toBe('safe')
    expect(computeRiskLevel(39.9)).toBe('safe')
  })

  it('GAP-01: 갭 비율 40~60% (경계값 포함) → caution', async () => {
    const { computeRiskLevel } = await import('@/lib/data/gap-stats')
    expect(computeRiskLevel(40)).toBe('caution')
    expect(computeRiskLevel(60)).toBe('caution')
  })

  it('GAP-01: 갭 비율 60% 초과 → danger', async () => {
    const { computeRiskLevel } = await import('@/lib/data/gap-stats')
    expect(computeRiskLevel(60.1)).toBe('danger')
    expect(computeRiskLevel(100)).toBe('danger')
  })
})

// ── GAP-02: RPC 빈 배열 → upsert 호출 없음 ────────────────────────────────────

describe('computeGapStats', () => {
  it('GAP-02: RPC 결과 빈 배열이면 upsert 호출 없음, complexesUpdated=0', async () => {
    const { computeGapStats } = await import('@/lib/data/gap-stats')
    const mockSupabase = makeMockSupabase()
    // rpc는 빈 배열 반환 (기본 설정)
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null })

    // complex_gap_stats chain을 별도 spy로 추적
    const gapChain = makeMockChain({ data: null, error: null })
    const upsertSpy = gapChain['upsert'] as ReturnType<typeof vi.fn>
    // from('complex_gap_stats') 호출 시 spy chain 반환하도록 덮어쓰기
    const fromFn = mockSupabase.from as ReturnType<typeof vi.fn>
    fromFn.mockImplementation((table: string) => {
      if (table === 'complex_gap_stats') return gapChain
      return makeMockChain({ data: [], error: null })
    })

    const result = await computeGapStats(mockSupabase as unknown as SupabaseClient<Database>)
    expect(upsertSpy).not.toHaveBeenCalled()
    expect(result.complexesUpdated).toBe(0)
    expect(result.complexesSkipped).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('GAP-03: RPC 에러 → errors 배열에 메시지 포함, complexesUpdated=0', async () => {
    const { computeGapStats } = await import('@/lib/data/gap-stats')
    const mockSupabase = makeMockSupabase()
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'RPC timeout' } })

    const result = await computeGapStats(mockSupabase as unknown as SupabaseClient<Database>)
    expect(result.complexesUpdated).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('RPC timeout')
  })
})

// ── GAP-04, GAP-05: GET /api/cron/daily ───────────────────────────────────────

describe('GET /api/cron/daily — Authorization 검증', () => {
  it('GAP-04: Authorization 헤더 없음 → 401', async () => {
    const { GET } = await import('@/app/api/cron/daily/route')
    const res = await GET(new Request('http://localhost/api/cron/daily'))
    expect(res.status).toBe(401)
  })

  it('GAP-05: 올바른 CRON_SECRET → 200 + ok 필드', async () => {
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    const mockSupabase = makeMockSupabase()
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockSupabase as unknown as ReturnType<typeof createSupabaseAdminClient>,
    )

    const { GET } = await import('@/app/api/cron/daily/route')
    const res = await GET(
      new Request('http://localhost/api/cron/daily', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body).toHaveProperty('ok')
  })
})
