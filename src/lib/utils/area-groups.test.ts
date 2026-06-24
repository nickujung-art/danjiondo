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

  it('네이버 exclusive_area_m2가 있으면 "84.73㎡" 형태로 label 표시', () => {
    const points = [makeNamed('34B', 84.73)]
    const [group] = extractTypedAreaGroups(points)
    expect(group.label).toBe('84.73㎡')
    expect(group.key).toBe('34B')
    expect(group.isNamed).toBe(true)
    expect(group.pyeongName).toBe('34B')
  })

  it('exclusive_area_m2가 null이면 pyeong_name으로 fallback', () => {
    const points = [makeNamed('34A', null)]
    const [group] = extractTypedAreaGroups(points)
    expect(group.label).toBe('34A')
  })

  it('34A / 34B 같은 단지에서 key로 구분됨', () => {
    const points = [
      makeNamed('34A', 84.72, 84.72),
      makeNamed('34B', 84.73, 84.73),
    ]
    const groups = extractTypedAreaGroups(points)
    expect(groups).toHaveLength(2)
    expect(groups.map(g => g.key)).toContain('34A')
    expect(groups.map(g => g.key)).toContain('34B')
    expect(groups.find(g => g.key === '34A')?.label).toBe('84.72㎡')
    expect(groups.find(g => g.key === '34B')?.label).toBe('84.73㎡')
  })

  it('isNamed=false 거래는 "84㎡" 형태 label, key는 숫자 문자열', () => {
    const points = [makeUnnamed(84.4)]
    const [group] = extractTypedAreaGroups(points)
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
    expect(groups[0].key).toBe('34B')
  })
})

describe('filterByTypedArea', () => {
  it('pyeong_name 기준으로 필터 (named)', () => {
    const points = [
      makeNamed('34A', 84.72, 84.72),
      makeNamed('34B', 84.73, 84.73),
    ]
    expect(filterByTypedArea(points, '34A')).toHaveLength(1)
    expect(filterByTypedArea(points, '34B')).toHaveLength(1)
  })

  it('Math.round fallback (unnamed)', () => {
    // 84.2 → round(84), 84.4 → round(84), 84.6 → round(85)
    const points = [makeUnnamed(84.2), makeUnnamed(84.4), makeUnnamed(59.0)]
    const result = filterByTypedArea(points, '84')
    expect(result).toHaveLength(2)
  })

  it('존재하지 않는 key면 빈 배열', () => {
    const points = [makeNamed('34A', 84.72)]
    expect(filterByTypedArea(points, '34B')).toHaveLength(0)
  })
})
