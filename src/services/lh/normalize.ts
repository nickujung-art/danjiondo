import type { LhNoticeItem, LhDetailSubd, NewListingRow } from './types'
import { parseLhDate } from './client'

export function normalizeLhItem(
  notice: LhNoticeItem,
  detail: LhDetailSubd | null,
): NewListingRow {
  const name = detail?.LCC_NT_NM ?? notice.PAN_NM ?? ''
  const region = notice.CNP_CD_NM ?? ''
  const rcept_endde = parseLhDate(notice.CLSG_DT)
  const mvn_prearnge_ym = detail?.MVIN_XPC_YM?.replace('-', '') ?? null

  return {
    name,
    region,
    pblanc_no:           `LH-${notice.PAN_ID}`,   // LH prefix로 청약홈과 충돌 방지
    pblanc_nm:           name || null,
    sgg_code:            null,                      // LH는 sgg_code 없음
    supply_region:       region || null,
    supply_count:        detail?.HSH_CNT ?? null,
    rcept_bgnde:         parseLhDate(notice.PAN_DT),
    rcept_endde,
    przwner_presnatn_de: null,
    mvn_prearnge_ym,
    hssply_adres:        null,
    is_active:           true,
    fetched_at:          new Date().toISOString(),
    price_min:           null,
    price_max:           null,
    source_code:         'lh',
  }
}
