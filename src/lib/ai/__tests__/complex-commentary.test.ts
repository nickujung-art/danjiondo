import { describe, it, expect } from 'vitest'
import {
  buildComplexPrompt,
  type ComplexCommentaryInput,
} from '../../../../scripts/generate-complex-commentary'

const baseRow: ComplexCommentaryInput = {
  complex_id:          'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  area_bucket:         '84',
  complex_name:        '테스트아파트',
  si:                  '창원시',
  gu:                  '의창구',
  built_year:          2000,
  household_count:     800,
  near_price:          30000,
  far_price:           32490,
  change_pct:          8.3,
  avg_mape:            0.086,
  model_name:          'chronos-bolt-small',
  training_count:      36,
  jeonse_ratio:        72.0,
  gap_amount:          8400,
  gap_risk_level:      'safe',
  price_change_30d:    2.5,
  tx_count_30d:        4,
  avg_sale_per_pyeong: 1180,
  hagwon_score:        42,
  management_cost_m2:  2300,
  primary_school_name: '창원초등학교',
  students_per_class:  22.4,
}

describe('buildComplexPrompt', () => {
  it('null 필드를 — 로 대체한다', () => {
    const row: ComplexCommentaryInput = {
      ...baseRow,
      jeonse_ratio:        null,
      gap_risk_level:      null,
      management_cost_m2:  null,
      primary_school_name: null,
      students_per_class:  null,
      hagwon_score:        null,
      price_change_30d:    null,
      tx_count_30d:        null,
    }
    const result = buildComplexPrompt(row)
    const dashCount = (result.match(/—/g) ?? []).length
    expect(dashCount).toBeGreaterThanOrEqual(5)
    expect(result).toContain('전세가율: —')
    expect(result).toContain('관리비: —')
    expect(result).toContain('배정 초등: —')
    expect(result).toContain('학원 점수: —')
  })

  it('gap_risk_level 한국어 매핑이 정확하다', () => {
    expect(buildComplexPrompt({ ...baseRow, gap_risk_level: 'safe' })).toContain('갭 위험도: 안전')
    expect(buildComplexPrompt({ ...baseRow, gap_risk_level: 'caution' })).toContain('갭 위험도: 주의')
    expect(buildComplexPrompt({ ...baseRow, gap_risk_level: 'danger' })).toContain('갭 위험도: 위험')
    expect(buildComplexPrompt({ ...baseRow, gap_risk_level: null })).toContain('갭 위험도: —')
  })

  it('built_year로 현재 연도 기준 연령을 계산한다', () => {
    const built_year = 2000
    const expectedAge = new Date().getFullYear() - built_year
    const result = buildComplexPrompt({ ...baseRow, built_year })
    expect(result).toContain(`약 ${expectedAge}년`)
  })

  it('양수 price_change_30d에 + 기호가 붙는다', () => {
    expect(buildComplexPrompt({ ...baseRow, price_change_30d: 5.2 })).toContain('+5.2%')
  })

  it('음수 price_change_30d에 + 기호가 붙지 않는다', () => {
    const result = buildComplexPrompt({ ...baseRow, price_change_30d: -3.1 })
    expect(result).toContain('-3.1%')
    expect(result).not.toMatch(/\+-3/)
  })

  it('결과에 단지명이 포함된다', () => {
    const result = buildComplexPrompt({ ...baseRow, complex_name: '용지더샹레이크파크' })
    expect(result).toContain('용지더샹레이크파크')
  })

  it('모든 섹션 헤더가 포함된다', () => {
    const result = buildComplexPrompt(baseRow)
    expect(result).toContain('## 예측')
    expect(result).toContain('## 시장 신호')
    expect(result).toContain('## 단지 특성')
    expect(result).toContain('## 학군')
  })
})
