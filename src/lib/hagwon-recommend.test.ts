import { describe, it, expect } from 'vitest'

// HAGWON-06: recommend_hagwons 가중치 스코어 계산 — 순수 함수 테스트
function scoreHagwon(distanceM: number, popularityScore: number | null, feeTierMatch: boolean | null): number {
  const distScore = 0.4 * (1 - Math.min(distanceM, 2000) / 2000)
  const popScore  = 0.3 * (popularityScore ?? 0)
  const tierScore = 0.3 * (feeTierMatch === null ? 0.5 : feeTierMatch ? 1.0 : 0.3)
  return distScore + popScore + tierScore
}

describe('hagwon recommend scoring', () => {
  it('distance weight: 0m = 0.4 contribution', () => {
    expect(scoreHagwon(0, 0, null)).toBeCloseTo(0.4 + 0 + 0.15, 2)
  })
  it('distance weight: 2000m = 0 distance contribution', () => {
    expect(scoreHagwon(2000, 0, null)).toBeCloseTo(0 + 0 + 0.15, 2)
  })
  it('popularity weight: 0.3 * popularity_score', () => {
    expect(scoreHagwon(0, 1.0, null)).toBeCloseTo(0.4 + 0.3 + 0.15, 2)
  })
  it('fee_tier match: 0.3 * 1.0', () => {
    expect(scoreHagwon(0, 0, true)).toBeCloseTo(0.4 + 0 + 0.3, 2)
  })
  it('fee_tier mismatch: 0.3 * 0.3', () => {
    expect(scoreHagwon(0, 0, false)).toBeCloseTo(0.4 + 0 + 0.09, 2)
  })
  it('fee_tier null hagwon: 0.3 * 0.5', () => {
    expect(scoreHagwon(0, 0, null)).toBeCloseTo(0.4 + 0 + 0.15, 2)
  })
})
