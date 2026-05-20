import { describe, it, expect } from 'vitest'
import { parseDateStr, normalizeCheongyakItem } from './normalize'

describe('parseDateStr', () => {
  it('YYYYMMDD 형식을 YYYY-MM-DD로 변환한다', () => {
    expect(parseDateStr('20260615')).toBe('2026-06-15')
  })

  it('이미 ISO 형식이면 그대로 반환한다', () => {
    expect(parseDateStr('2026-06-15')).toBe('2026-06-15')
  })

  it('undefined이면 null 반환', () => {
    expect(parseDateStr(undefined)).toBeNull()
  })

  it('빈 문자열이면 null 반환', () => {
    expect(parseDateStr('')).toBeNull()
  })

  it('null이면 null 반환', () => {
    expect(parseDateStr(null)).toBeNull()
  })

  it('8자리 숫자 문자열은 substring 변환만 수행 (Postgres 캐스트 책임)', () => {
    // 31일 없는 달이라도 substring 변환은 그대로 수행
    expect(parseDateStr('20260631')).toBe('2026-06-31')
  })
})

describe('normalizeCheongyakItem', () => {
  const sampleItem = {
    pblancNo: '2026000123',
    pblancNm: '창원파크',
    subscrptAreaCodeNm: '경상남도 창원시',
    hssplyAdres: '창원시 의창구 ...',
    gnrlSuplyHshldco: 500,
    rcptbgnde: '20260601',
    rcptendde: '20260603',
    przwnerPresnatnDe: '20260620',
    mvnPrearngeMntdy: '202712',
    houseSecd: '01',
    subscrptAreaCode: '4812500000',
  }

  it('필드를 올바른 DB 행으로 변환한다', () => {
    const result = normalizeCheongyakItem(sampleItem)

    expect(result.name).toBe('창원파크')
    expect(result.region).toBe('경상남도 창원시')
    expect(result.pblanc_no).toBe('2026000123')
    expect(result.pblanc_nm).toBe('창원파크')
    expect(result.sgg_code).toBe('48125')
    expect(result.supply_region).toBe('경상남도 창원시')
    expect(result.supply_count).toBe(500)
    expect(result.rcept_bgnde).toBe('2026-06-01')
    expect(result.rcept_endde).toBe('2026-06-03')
    expect(result.przwner_presnatn_de).toBe('2026-06-20')
    expect(result.mvn_prearnge_ym).toBe('202712')
    expect(result.hssply_adres).toBe('창원시 의창구 ...')
    expect(result.is_active).toBe(true)
    expect(result.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('누락 필드가 있어도 null로 채워 정상 작동한다', () => {
    const result = normalizeCheongyakItem({ pblancNo: '2026000999' })

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
