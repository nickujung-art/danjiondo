import { describe, it, expect } from 'vitest'
import { normalizeCheongyakItem } from './normalize'

describe('normalizeCheongyakItem', () => {
  const sampleItem = {
    PBLANC_NO:             '2026000123',
    HOUSE_NM:              '창원파크',
    SUBSCRPT_AREA_CODE_NM: '경남',
    HSSPLY_ADRES:          '경상남도 창원시 의창구 ...',
    TOT_SUPLY_HSHLDCO:     500,
    RCEPT_BGNDE:           '2026-06-01',
    RCEPT_ENDDE:           '2026-06-03',
    PRZWNER_PRESNATN_DE:   '2026-06-20',
    MVN_PREARNGE_YM:       '202712',
    HOUSE_SECD:            '01',
    SUBSCRPT_AREA_CODE:    '621',
  }

  it('필드를 올바른 DB 행으로 변환한다', () => {
    const result = normalizeCheongyakItem(sampleItem)

    expect(result.name).toBe('창원파크')
    expect(result.region).toBe('경남')
    expect(result.pblanc_no).toBe('2026000123')
    expect(result.pblanc_nm).toBe('창원파크')
    expect(result.sgg_code).toBe('621')
    expect(result.supply_region).toBe('경남')
    expect(result.supply_count).toBe(500)
    expect(result.rcept_bgnde).toBe('2026-06-01')
    expect(result.rcept_endde).toBe('2026-06-03')
    expect(result.przwner_presnatn_de).toBe('2026-06-20')
    expect(result.mvn_prearnge_ym).toBe('202712')
    expect(result.hssply_adres).toBe('경상남도 창원시 의창구 ...')
    expect(result.is_active).toBe(true)
    expect(result.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('누락 필드가 있어도 null로 채워 정상 작동한다', () => {
    const result = normalizeCheongyakItem({ PBLANC_NO: '2026000999' })

    expect(result.pblanc_no).toBe('2026000999')
    expect(result.name).toBe('')
    expect(result.region).toBe('')
    expect(result.sgg_code).toBeNull()
    expect(result.supply_count).toBeNull()
    expect(result.rcept_bgnde).toBeNull()
    expect(result.hssply_adres).toBeNull()
    expect(result.is_active).toBe(true)
  })

  it('결과 객체가 정확히 14개 필드를 가진다', () => {
    const result = normalizeCheongyakItem(sampleItem)
    expect(Object.keys(result)).toHaveLength(14)
  })
})
