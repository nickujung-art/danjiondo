/**
 * DIFF-01 — TierBadge: 5단계 텍스트 배지 테스트
 * D-06 AI 슬롭 금지: 이모지 없이 텍스트 약자만 사용
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('TierBadge (getTierBadgeText)', () => {
  it('bronze → B', async () => {
    const { getTierBadgeText } = await import('@/lib/data/member-tier')
    expect(getTierBadgeText('bronze')).toBe('B')
  })

  it('silver → S', async () => {
    const { getTierBadgeText } = await import('@/lib/data/member-tier')
    expect(getTierBadgeText('silver')).toBe('S')
  })

  it('gold → G', async () => {
    const { getTierBadgeText } = await import('@/lib/data/member-tier')
    expect(getTierBadgeText('gold')).toBe('G')
  })

  it('platinum → P', async () => {
    const { getTierBadgeText } = await import('@/lib/data/member-tier')
    expect(getTierBadgeText('platinum')).toBe('P')
  })

  it('diamond → D', async () => {
    const { getTierBadgeText } = await import('@/lib/data/member-tier')
    expect(getTierBadgeText('diamond')).toBe('D')
  })
})
