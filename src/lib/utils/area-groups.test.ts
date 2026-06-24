import { describe, it, expect } from 'vitest'
import {
  extractAreaGroups,
  filterByArea,
  extractTypedAreaGroups,
  filterByTypedArea,
} from './area-groups'

describe('extractAreaGroups', () => {
  it('빈 배열이면 빈 배열 반환', () => {
    expect(extractAreaGroups([])).toEqual([])
  })

  it('거래 건수 내림차순으로 정렬', () => {
    const points = [
      { area: 84 }, { area: 84 }, { area: 59 },
    ]
    expect(extractAreaGroups(points)).toEqual([84, 59])
  })
})

describe('filterByArea', () => {
  it('Math.round 기준으로 필터', () => {
    // 84.2 → round(84), 84.4 → round(84), 84.6 → round(85)
    const points = [{ area: 84.2 }, { area: 84.4 }, { area: 59.0 }]
    expect(filterByArea(points, 84)).toHaveLength(2)
    expect(filterByArea(points, 59)).toHaveLength(1)
  })
})

// TypedAreaPoint 타입의 테스트 데이터 헬퍼
function makeNamed(pyeongName: string, exclusiveAreaM2: number | null, area = 84) {
  return { area, areaTypeId: 'uuid-1', pyeongName, exclusiveAreaM2 }
}
function makeUnnamed(area: number) {
  return { area, areaTypeId: null, pyeongName: null, exclusiveAreaM2: null }
}

describe('extractTypedAreaGroups', () => {
  it('빈 배열이면 빈 배열 반환', () => {
    expect(extractTypedAreaGroups([])).toEqual([])
  })

  it('고유한 m² → 정수㎡만 표시 ("59㎡")', () => {
    const points = [makeNamed('25', 59.45, 59.46)]
    const group = extractTypedAreaGroups(points)[0]!
    expect(group.label).toBe('59㎡')
    expect(group.key).toBe('25')
    expect(group.isNamed).toBe(true)
    expect(group.pyeongName).toBe('25')
  })

  it('충돌하는 m² → 정수㎡ + suffix ("84㎡A", "84㎡B")', () => {
    const points = [
      makeNamed('34A', 84.72, 84.72),
      makeNamed('34B', 84.73, 84.73),
    ]
    const groups = extractTypedAreaGroups(points)
    expect(groups).toHaveLength(2)
    expect(groups.find(g => g.key === '34A')?.label).toBe('84㎡A')   // Math.floor(84.72)=84
    expect(groups.find(g => g.key === '34B')?.label).toBe('84㎡B')   // Math.floor(84.73)=84
  })

  it('exclusive_area_m2가 null이면 pyeong_name으로 fallback', () => {
    const points = [makeNamed('34A', null)]
    const group = extractTypedAreaGroups(points)[0]!
    expect(group.label).toBe('34A')
  })

  it('실제 용지아이파크 케이스: 6개 평형 중 34A/34B만 충돌', () => {
    const points = [
      makeNamed('25',  59.45, 59.46),
      makeNamed('34A', 84.72, 84.72),
      makeNamed('34B', 84.73, 84.73),
      makeNamed('39',  100.19, 100.19),
      makeNamed('43',  114.80, 114.81),
      makeNamed('47',  127.36, 127.37),
    ]
    const groups = extractTypedAreaGroups(points)
    const labels = groups.map(g => g.label)
    expect(labels).toContain('59㎡')
    expect(labels).toContain('84㎡A')
    expect(labels).toContain('84㎡B')
    expect(labels).toContain('100㎡')
    expect(labels).toContain('114㎡')
    expect(labels).toContain('127㎡')
  })

  it('isNamed=false 거래는 "84㎡" 형태 label', () => {
    const points = [makeUnnamed(84.4)]
    const group = extractTypedAreaGroups(points)[0]!
    expect(group.label).toBe('84㎡')
    expect(group.key).toBe('84')
    expect(group.isNamed).toBe(false)
    expect(group.pyeongName).toBeNull()
  })

  it('거래 건수 내림차순 정렬', () => {
    const points = [
      makeNamed('34A', 84.72, 84.72),
      makeNamed('34B', 84.73, 84.73),
      makeNamed('34B', 84.73, 84.73),
    ]
    const groups = extractTypedAreaGroups(points)
    expect(groups[0]!.key).toBe('34B')
  })
})

describe('filterByTypedArea', () => {
  it('pyeong_name key 기준으로 필터 (named)', () => {
    const points = [
      makeNamed('34A', 84.72, 84.72),
      makeNamed('34B', 84.73, 84.73),
    ]
    expect(filterByTypedArea(points, '34A')).toHaveLength(1)
    expect(filterByTypedArea(points, '34B')).toHaveLength(1)
  })

  it('Math.round fallback (unnamed)', () => {
    // 84.2 → round(84), 84.4 → round(84)
    const points = [makeUnnamed(84.2), makeUnnamed(84.4), makeUnnamed(59.0)]
    const result = filterByTypedArea(points, '84')
    expect(result).toHaveLength(2)
  })

  it('존재하지 않는 key면 빈 배열', () => {
    const points = [makeNamed('34A', 84.72)]
    expect(filterByTypedArea(points, '34B')).toHaveLength(0)
  })
})
