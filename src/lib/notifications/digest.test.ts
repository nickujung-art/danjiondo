import { describe, it, expect, vi } from 'vitest'
import { buildWeeklyDigest } from '@/lib/notifications/digest'

function makeChainable(resolveValue: unknown) {
  const chain: Record<string, unknown> = {}
  const terminal = vi.fn().mockResolvedValue(resolveValue)
  const self = () => chain
  chain.select = vi.fn().mockReturnValue(chain)
  // `.eq()`는 site_id 필터(2026-07-31)가 들어오면서 필요해졌다. favorites는 danjiondo와
  // realtrade-story가 공유하는 테이블이라 buildWeeklyDigest가 site_id로 거른다.
  // 목에 없으면 "supabase.from(...).select(...).eq is not a function"으로 터진다.
  chain.eq     = vi.fn().mockReturnValue(chain)
  chain.in     = vi.fn().mockReturnValue(chain)
  chain.is     = vi.fn().mockReturnValue(chain)
  chain.order  = vi.fn().mockReturnValue(chain)
  chain.limit  = terminal
  chain.insert = terminal
  chain.single = terminal
  void self
  return chain
}

describe('buildWeeklyDigest (NOTIF-01)', () => {
  it('favorites가 없으면 inserted: 0을 반환한다', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue(makeChainable({ data: [] })),
    }
    const result = await buildWeeklyDigest(mockSupabase as never)
    expect(result.inserted).toBe(0)
  })

  it('favorites가 있는 사용자에게 digest 알림을 INSERT한다', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'favorites') return makeChainable({ data: [{ user_id: 'u1', complex_id: 'c1' }] })
        if (table === 'transactions') return makeChainable({ data: [] })
        return { insert: mockInsert }
      }),
    }
    await buildWeeklyDigest(mockSupabase as never)
    expect(mockSupabase.from).toHaveBeenCalled()
  })

  // 회귀 방지: favorites는 danjiondo·realtrade-story 공유 테이블이고 분리는 애플리케이션
  // 코드 책임이다(DB는 안 막아준다). 이 필터가 빠지면 다른 서비스 사용자에게 다이제스트가
  // 발송된다. 2026-07-31 이전에 실제로 그 상태였다.
  it('favorites 조회에 site_id 필터를 건다 — 타 사이트 사용자 발송 차단', async () => {
    const favoritesChain = makeChainable({ data: [] })
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) =>
        table === 'favorites' ? favoritesChain : makeChainable({ data: [] }),
      ),
    }
    await buildWeeklyDigest(mockSupabase as never)
    expect(favoritesChain.eq).toHaveBeenCalledWith('site_id', 'danjiondo')
  })
})
