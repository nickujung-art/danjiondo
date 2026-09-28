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

  /*
    🔴 **개수가 아니라 필드 이름을 못 박는다**(2026-09-28).

    원래는 `toHaveLength(17)` 이었다. 그 사이 기능 커밋들이 필드를 3개 늘렸고
    (price_min·price_max·source_code — 청약홈 평형별 분양가 적재, 92d4258),
    아무도 이 숫자를 갱신하지 않아 **CI 가 2026-09-11부터 17일간 빨간불**이었다.
    833개 중 딱 이 1건만 실패했는데, 빨간불이 상시 켜져 있으니 **새로 깨진 것을 알릴 방법이 없었다.**

    개수만 보면 "20이어야 하는데 17" 이라고만 알려준다 — 어느 필드가 늘었는지 모른다.
    이름을 박으면 실패 메시지가 **무엇이 바뀌었는지 그대로 보여준다.**
    이 시험의 목적은 "필드가 말없이 바뀌는 것"을 잡는 것이므로 그쪽이 맞다.

    필드를 의도적으로 늘렸다면 **여기 이름을 함께 추가**하면 된다.
  */
  it('반환 필드 집합이 바뀌면 알려준다', () => {
    const result = normalizeCheongyakItem(sampleItem)

    expect(Object.keys(result).sort()).toEqual(
      [
        'bsns_mby_nm',
        'cnstrct_entrps_nm',
        'fetched_at',
        'hmpg_adres',
        'hssply_adres',
        'is_active',
        'mvn_prearnge_ym',
        'name',
        'pblanc_nm',
        'pblanc_no',
        'price_max',
        'price_min',
        'przwner_presnatn_de',
        'rcept_bgnde',
        'rcept_endde',
        'region',
        'sgg_code',
        'source_code',
        'supply_count',
        'supply_region',
      ].sort(),
    )
  })
})
