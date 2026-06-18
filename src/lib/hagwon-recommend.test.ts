import { describe, it } from 'vitest'

// HAGWON-06: recommend_hagwons 가중치 스코어 계산 테스트
// Wave 4 (28-04)에서 실제 구현 후 채워짐
describe('hagwon recommend scoring', () => {
  it.todo('distance weight: 0.4 * (1 - dist/2000)')
  it.todo('popularity weight: 0.3 * popularity_score')
  it.todo('fee_tier match: 0.3 * 1.0 when tier matches')
  it.todo('fee_tier mismatch: 0.3 * 0.3 when tier differs')
  it.todo('fee_tier null hagwon: 0.3 * 0.5 penalty')
  it.todo('no age_group filter returns all active within 2km')
})
