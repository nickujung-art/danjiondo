/**
 * 청약홈 API 응답 → new_listings DB 행 변환 유틸
 * odcloud.kr API는 날짜를 YYYY-MM-DD로 반환하므로 변환 불필요.
 * competition_rate는 API 2 별도 호출 후 UPDATE.
 */
import type { CheongyakItem, NewListingCheongyakRow } from './types'

/**
 * API 응답 1건을 new_listings 삽입용 행으로 정규화.
 */
export function normalizeCheongyakItem(item: CheongyakItem): NewListingCheongyakRow {
  return {
    name:                item.HOUSE_NM ?? '',
    region:              item.SUBSCRPT_AREA_CODE_NM ?? '',
    pblanc_no:           item.PBLANC_NO,
    pblanc_nm:           item.HOUSE_NM ?? null,
    sgg_code:            item.SUBSCRPT_AREA_CODE ?? null,
    supply_region:       item.SUBSCRPT_AREA_CODE_NM ?? null,
    supply_count:        item.TOT_SUPLY_HSHLDCO ?? null,
    rcept_bgnde:         item.RCEPT_BGNDE ?? null,
    rcept_endde:         item.RCEPT_ENDDE ?? null,
    przwner_presnatn_de: item.PRZWNER_PRESNATN_DE ?? null,
    mvn_prearnge_ym:     item.MVN_PREARNGE_YM ?? null,
    hssply_adres:        item.HSSPLY_ADRES ?? null,
    is_active:           true,
    fetched_at:          new Date().toISOString(),
  }
}
