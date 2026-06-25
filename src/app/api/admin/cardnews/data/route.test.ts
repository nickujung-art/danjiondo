/**
 * TDD: POST /api/admin/cardnews/data 집계 API 테스트
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { createSupabaseServerClient } from '@/lib/supabase/server'
import type { createSupabaseAdminClient } from '@/lib/supabase/admin'

vi.mock('server-only', () => ({}))

// Supabase 클라이언트 모킹
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(),
}))

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>
type AdminClient = ReturnType<typeof createSupabaseAdminClient>

function makeMockSupabaseServer(user: { id: string } | null, role: string | null): ServerClient {
  const profileQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: role ? { role } : null }),
  }
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn().mockReturnValue(profileQuery),
  } as unknown as ServerClient
}

function makeMockAdminClient(transactionsData: unknown[] = [], complexesData: unknown[] = []): AdminClient {
  const histQuery = {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: transactionsData }),
  }
  const complexQuery = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: complexesData }),
  }
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'complexes') return complexQuery
      return histQuery
    }),
  } as unknown as AdminClient
}

describe('POST /api/admin/cardnews/data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('인증되지 않은 요청은 401을 반환한다', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeMockSupabaseServer(null, null),
    )

    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/admin/cardnews/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: 'weekly', topic: 'sale_top', sggCodes: ['48123'], areaMin: 0, areaMax: 300 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('admin이 아닌 role은 403을 반환한다', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeMockSupabaseServer({ id: 'user-1' }, 'user'),
    )

    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/admin/cardnews/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: 'weekly', topic: 'sale_top', sggCodes: ['48123'], areaMin: 0, areaMax: 300 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('잘못된 body는 400을 반환한다', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeMockSupabaseServer({ id: 'user-1' }, 'admin'),
    )
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    vi.mocked(createSupabaseAdminClient).mockReturnValue(makeMockAdminClient())

    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/admin/cardnews/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: 'weekly', sggCodes: [] }), // sggCodes min(1) 위반
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('admin 권한으로 valid body 요청 시 { data, from, to, warning } 형태로 반환한다', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeMockSupabaseServer({ id: 'user-1' }, 'admin'),
    )
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin')
    vi.mocked(createSupabaseAdminClient).mockReturnValue(makeMockAdminClient([], []))

    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/admin/cardnews/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: 'monthly', topic: 'sale_top', sggCodes: ['48123'], areaMin: 80, areaMax: 95 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json() as { data: unknown[]; from: string; to: string; warning: boolean }
    expect(json).toHaveProperty('data')
    expect(json).toHaveProperty('from')
    expect(json).toHaveProperty('to')
    expect(json).toHaveProperty('warning')
    expect(Array.isArray(json.data)).toBe(true)
  })
})
