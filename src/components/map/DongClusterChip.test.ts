import { describe, it, expect } from 'vitest'
import { computeDongChips, deduplicateDongChips } from './DongClusterChip'
import type { DongChip } from './DongClusterChip'
import type { ComplexMapItem } from '@/lib/data/complexes-map'

function makeComplex(overrides: Partial<ComplexMapItem>): ComplexMapItem {
  return {
    id:                  'test-id',
    canonical_name:      '테스트단지',
    lat:                 35.2,
    lng:                 128.6,
    sgg_code:            '38000',
    avg_sale_per_pyeong: null,
    view_count:          0,
    price_change_30d:    null,
    tx_count_30d:        0,
    status:              'active',
    built_year:          null,
    household_count:     null,
    hagwon_grade:        null,
    is_new_record_30d:   false,
    si:                  '창원시',
    gu:                  '성산구',
    dong:                '상남동',
    recent_price:        null,
    recent_date:         null,
    recent_area_m2:      null,
    ...overrides,
  }
}

describe('computeDongChips', () => {
  it('두 단지가 같은 동이면 하나의 칩으로 그룹화된다', () => {
    const complexes = [
      makeComplex({ id: 'a', lat: 35.1, lng: 128.5, dong: '상남동' }),
      makeComplex({ id: 'b', lat: 35.3, lng: 128.7, dong: '상남동' }),
    ]
    const chips = computeDongChips(complexes)
    expect(chips).toHaveLength(1)
    expect(chips[0]!.dong).toBe('상남동')
    expect(chips[0]!.count).toBe(2)
  })

  it('중심 좌표는 그룹 내 단지 lat/lng 평균이다', () => {
    const complexes = [
      makeComplex({ id: 'a', lat: 35.0, lng: 128.0, dong: '상남동' }),
      makeComplex({ id: 'b', lat: 35.4, lng: 128.4, dong: '상남동' }),
    ]
    const chips = computeDongChips(complexes)
    expect(chips[0]!.lat).toBeCloseTo(35.2, 5)
    expect(chips[0]!.lng).toBeCloseTo(128.2, 5)
  })

  it('다른 gu의 동일한 dong 이름은 별도 칩으로 분리된다', () => {
    const complexes = [
      makeComplex({ id: 'a', gu: '성산구', dong: '중앙동' }),
      makeComplex({ id: 'b', gu: '의창구', dong: '중앙동' }),
    ]
    const chips = computeDongChips(complexes)
    expect(chips).toHaveLength(2)
  })

  it('dong=null 단지는 기타 칩으로 묶인다', () => {
    const complexes = [
      makeComplex({ id: 'a', dong: null }),
      makeComplex({ id: 'b', dong: null }),
    ]
    const chips = computeDongChips(complexes)
    expect(chips).toHaveLength(1)
    expect(chips[0]!.dong).toBe('기타')
    expect(chips[0]!.count).toBe(2)
  })

  it('maxPrice는 그룹 내 recent_price 최댓값이고 null은 무시된다', () => {
    const complexes = [
      makeComplex({ id: 'a', dong: '상남동', recent_price: 50000 }),
      makeComplex({ id: 'b', dong: '상남동', recent_price: 80000 }),
      makeComplex({ id: 'c', dong: '상남동', recent_price: null }),
    ]
    const chips = computeDongChips(complexes)
    expect(chips[0]!.maxPrice).toBe(80000)
  })

  it('모든 recent_price가 null이면 maxPrice는 null이다', () => {
    const complexes = [
      makeComplex({ id: 'a', dong: '상남동', recent_price: null }),
      makeComplex({ id: 'b', dong: '상남동', recent_price: null }),
    ]
    const chips = computeDongChips(complexes)
    expect(chips[0]!.maxPrice).toBeNull()
  })

  it('빈 배열을 전달하면 빈 배열을 반환한다', () => {
    expect(computeDongChips([])).toHaveLength(0)
  })
})

function makeDongChip(lat: number, lng: number, count = 1): DongChip {
  return { gu: '성산구', dong: '테스트동', lat, lng, count, maxPrice: null, memberLats: [lat], memberLngs: [lng] }
}

describe('deduplicateDongChips', () => {
  it('거리가 임계값 이상인 칩은 모두 유지된다', () => {
    const chips = [
      makeDongChip(35.0, 128.0),
      makeDongChip(35.1, 128.1),  // ~14km 이상 거리
    ]
    expect(deduplicateDongChips(chips, 0.009)).toHaveLength(2)
  })

  it('임계값 이내 두 칩 중 count 많은 칩만 남는다', () => {
    const chips = [
      makeDongChip(35.2000, 128.6000, 5),
      makeDongChip(35.2001, 128.6001, 2),  // 매우 가까움 (~0.0001)
    ]
    const result = deduplicateDongChips(chips, 0.009)
    expect(result).toHaveLength(1)
    expect(result[0]!.count).toBe(5)
  })

  it('빈 배열을 전달하면 빈 배열을 반환한다', () => {
    expect(deduplicateDongChips([], 0.009)).toHaveLength(0)
  })

  it('칩이 1개면 그대로 반환한다', () => {
    const chips = [makeDongChip(35.2, 128.6, 3)]
    expect(deduplicateDongChips(chips, 0.009)).toHaveLength(1)
  })
})
