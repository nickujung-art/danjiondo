/**
 * 청약홈 API 응답 → new_listings DB 행 변환 유틸
 * odcloud.kr API는 날짜를 YYYY-MM-DD로 반환하므로 변환 불필요.
 * competition_rate는 별도 호출 후 UPDATE.
 */
import type { CheongyakItem, CheongyakRemndrItem, NewListingCheongyakRow } from './types'

/**
 * 분양정보 API 응답 1건을 new_listings 삽입용 행으로 정규화.
 */
export function normalizeCheongyakItem(
  item: CheongyakItem,
  prices?: { min: number; max: number },
): NewListingCheongyakRow {
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
    price_min:           prices?.min ?? null,
    price_max:           prices?.max ?? null,
    source_code:         'cheongyak',
  }
}

/**
 * 잔여세대·무순위 API 응답 1건을 new_listings 삽입용 행으로 정규화.
 * rcept_endde: CNTRCT_CNCLS_ENDDE(계약종료) 우선 — 가장 늦은 활동 시점으로 만료 판단.
 */
export function normalizeRemndrItem(item: CheongyakRemndrItem): NewListingCheongyakRow {
  const rcept_endde =
    item.CNTRCT_CNCLS_ENDDE ??
    item.SUBSCRPT_RCEPT_ENDDE ??
    item.GNRL_RCEPT_ENDDE ??
    null

  const rcept_bgnde =
    item.SUBSCRPT_RCEPT_BGNDE ??
    item.GNRL_RCEPT_BGNDE ??
    null

  return {
    name:                item.HOUSE_NM ?? '',
    region:              item.SUBSCRPT_AREA_CODE_NM ?? '',
    pblanc_no:           item.PBLANC_NO,
    pblanc_nm:           item.HOUSE_NM ?? null,
    sgg_code:            item.SUBSCRPT_AREA_CODE ?? null,
    supply_region:       item.SUBSCRPT_AREA_CODE_NM ?? null,
    supply_count:        item.TOT_SUPLY_HSHLDCO ?? null,
    rcept_bgnde,
    rcept_endde,
    przwner_presnatn_de: item.PRZWNER_PRESNATN_DE ?? null,
    mvn_prearnge_ym:     item.MVN_PREARNGE_YM ?? null,
    hssply_adres:        item.HSSPLY_ADRES ?? null,
    is_active:           true,
    fetched_at:          new Date().toISOString(),
    price_min:           null,
    price_max:           null,
    source_code:         'cheongyak',
  }
}
