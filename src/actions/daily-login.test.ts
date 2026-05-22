import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

describe('dailyLoginAction', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('미인증 사용자(user=null) → false 반환', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)

    const { dailyLoginAction } = await import('./daily-login')
    const result = await dailyLoginAction()
    expect(result).toBe(false)
  })

  it('인증된 사용자 + RPC true → true 반환', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as never)

    const { dailyLoginAction } = await import('./daily-login')
    const result = await dailyLoginAction()
    expect(result).toBe(true)
  })

  it('인증된 사용자 + RPC false (당일 이미 지급) → false 반환', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    } as never)

    const { dailyLoginAction } = await import('./daily-login')
    const result = await dailyLoginAction()
    expect(result).toBe(false)
  })
})
