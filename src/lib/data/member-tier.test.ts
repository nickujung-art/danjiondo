import { describe, it, expect } from 'vitest'
import {
  getTierLabel,
  getTierBadgeText,
  getTierColorClass,
  getNotificationDelay,
} from './member-tier'

describe('getTierLabel', () => {
  it("'bronze' → '브론즈'", () => expect(getTierLabel('bronze')).toBe('브론즈'))
  it("'diamond' → '다이아'", () => expect(getTierLabel('diamond')).toBe('다이아'))
  it("'platinum' → '플래티넘'", () => expect(getTierLabel('platinum')).toBe('플래티넘'))
})

describe('getTierBadgeText', () => {
  it("'platinum' → 'P'", () => expect(getTierBadgeText('platinum')).toBe('P'))
  it("'diamond' → 'D'", () => expect(getTierBadgeText('diamond')).toBe('D'))
})

describe('getTierColorClass', () => {
  it('각 티어별 다른 클래스를 반환한다', () => {
    const tiers = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const
    const classes = tiers.map(t => getTierColorClass(t))
    const unique = new Set(classes)
    expect(unique.size).toBe(5)
  })
})

describe('getNotificationDelay', () => {
  it("'diamond' → 0", () => expect(getNotificationDelay('diamond')).toBe(0))
  it("'gold' → 0", () => expect(getNotificationDelay('gold')).toBe(0))
  it("'silver' → 1800000", () => expect(getNotificationDelay('silver')).toBe(30 * 60 * 1_000))
  it("'bronze' → 1800000", () => expect(getNotificationDelay('bronze')).toBe(30 * 60 * 1_000))
})
