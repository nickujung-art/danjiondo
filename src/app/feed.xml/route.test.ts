/**
 * feed.xml Route Handler 테스트
 * Phase 23 — cancel_date / superseded_by IS NULL 필터 검증 (CLAUDE.md)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/readonly', () => ({
  createReadonlyClient: vi.fn(),
}))

import { GET } from './route'
import { createReadonlyClient } from '@/lib/supabase/readonly'

describe('GET /feed.xml', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('cancel_date IS NULL 필터를 포함한다 (CLAUDE.md)', async () => {
    const isMock = vi.fn().mockReturnThis()
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: isMock,
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    ;(createReadonlyClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    })

    await GET()

    // CLAUDE.md: cancel_date IS NULL AND superseded_by IS NULL 필수
    const isCalls = isMock.mock.calls as [string, null][]
    expect(isCalls.some(([col, val]) => col === 'cancel_date' && val === null)).toBe(true)
    expect(isCalls.some(([col, val]) => col === 'superseded_by' && val === null)).toBe(true)
  })

  it('RSS 2.0 Content-Type 헤더를 반환한다', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    ;(createReadonlyClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    })

    const response = await GET()
    expect(response.headers.get('Content-Type')).toContain('application/rss+xml')
  })
})
