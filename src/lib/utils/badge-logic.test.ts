import { describe, it, expect } from 'vitest'
import { determineBadge } from '@/components/map/markers/badge-logic'

const BASE: Parameters<typeof determineBadge>[0] = {
  status:            'active',
  built_year:        2010,
  is_new_record_30d: false,
  tx_count_30d:      0,
  view_count:        0,
  p95_view_count:    100,
}

describe('determineBadge — 배지 판별 로직', () => {
  it('status=pre_sale이면 pre_sale 배지를 반환한다', () => {
    expect(determineBadge({ ...BASE, status: 'pre_sale' })).toBe('pre_sale')
  })

  it('built_year >= 2021이면 new_build 배지를 반환한다', () => {
    expect(determineBadge({ ...BASE, built_year: 2022 })).toBe('new_build')
  })

  it('pre_sale이 new_build보다 높은 우선순위를 가진다', () => {
    expect(determineBadge({ ...BASE, status: 'pre_sale', built_year: 2023 })).toBe('pre_sale')
  })

  it('is_new_record_30d=true이면 new_record를 반환한다', () => {
    expect(determineBadge({ ...BASE, is_new_record_30d: true })).toBe('new_record')
  })

  it('new_build가 new_record보다 높은 우선순위를 가진다', () => {
    expect(determineBadge({ ...BASE, built_year: 2023, is_new_record_30d: true })).toBe('new_build')
  })

  it('tx_count_30d >= 5이면 high_volume을 반환한다', () => {
    expect(determineBadge({ ...BASE, tx_count_30d: 5 })).toBe('high_volume')
  })

  it('tx_count_30d < 5이면 high_volume을 부여하지 않는다', () => {
    expect(determineBadge({ ...BASE, tx_count_30d: 4 })).toBe('none')
  })

  it('view_count >= p95_view_count이면 popular를 반환한다', () => {
    expect(determineBadge({ ...BASE, view_count: 100, p95_view_count: 100 })).toBe('popular')
  })

  it('p95_view_count = 0이면 popular를 부여하지 않는다', () => {
    expect(determineBadge({ ...BASE, view_count: 0, p95_view_count: 0 })).toBe('none')
  })

  it('high_volume이 popular보다 높은 우선순위를 가진다', () => {
    expect(determineBadge({ ...BASE, tx_count_30d: 5, view_count: 100, p95_view_count: 100 })).toBe('high_volume')
  })

  it('모든 조건 불충족 시 none을 반환한다', () => {
    expect(determineBadge(BASE)).toBe('none')
  })
})
