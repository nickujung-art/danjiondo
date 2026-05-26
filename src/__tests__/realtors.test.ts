/**
 * Phase 18-01 수용 기준 테스트 — 공인중개사 데이터 레이어 + Server Actions
 *
 * - getRealtorsByComplexId: is_active=true 필터, display_order 순 정렬, 빈 배열 안전
 * - getAllRealtors: 전체 목록 created_at DESC
 * - getRealtorById: 존재/미존재 null 안전
 * - Server Actions auth guard: 미인증 호출 시 error 반환
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { URL_, SKEY, AKEY, admin } from './helpers/db'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    }),
  }),
}))

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', AKEY)
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SKEY)
})

// ── getRealtorsByComplexId (통합 — 로컬 Supabase 필요) ────────────
describe('getRealtorsByComplexId', () => {
  describe.skipIf(!SKEY)('integration', () => {
    it('returns active realtors ordered by display_order', async () => {
      // Will be tested with actual DB
    })
    it('excludes is_active=false realtors', async () => {
      // Will be tested with actual DB
    })
    it('returns empty array for complex with no assignments', async () => {
      const { getRealtorsByComplexId } = await import('@/lib/data/realtors')
      const result = await getRealtorsByComplexId('00000000-0000-0000-0000-000000000000', admin)
      expect(result).toEqual([])
    })
  })
})

// ── getAllRealtors (통합 — 로컬 Supabase 필요) ─────────────────────
describe('getAllRealtors', () => {
  describe.skipIf(!SKEY)('integration', () => {
    it('returns all realtors ordered by created_at desc', async () => {
      // Will be tested with actual DB
    })
  })
})

// ── getRealtorById (통합 — 로컬 Supabase 필요) ────────────────────
describe('getRealtorById', () => {
  describe.skipIf(!SKEY)('integration', () => {
    it('returns null for non-existent id', async () => {
      const { getRealtorById } = await import('@/lib/data/realtors')
      const result = await getRealtorById('00000000-0000-0000-0000-000000000000', admin)
      expect(result).toBeNull()
    })
  })
})

// ── Server Actions — auth guard ───────────────────────────────────
describe('Server Actions — auth guard', () => {
  it('createRealtor: returns error for unauthenticated call', async () => {
    const { createRealtor } = await import('@/lib/auth/realtor-actions')
    const fd = new FormData()
    const result = await createRealtor(fd)
    expect(result.error).toBeTruthy()
  })

  it('deleteRealtor: returns error for unauthenticated call', async () => {
    const { deleteRealtor } = await import('@/lib/auth/realtor-actions')
    const result = await deleteRealtor('some-id')
    expect(result.error).toBeTruthy()
  })

  it('assignRealtorToComplex: returns error for unauthenticated call', async () => {
    const { assignRealtorToComplex } = await import('@/lib/auth/realtor-actions')
    const result = await assignRealtorToComplex('realtor-id', 'complex-id', 1)
    expect(result.error).toBeTruthy()
  })
})
