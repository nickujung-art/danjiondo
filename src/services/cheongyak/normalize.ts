/**
 * 청약홈 API 응답 → new_listings DB 행 변환 유틸
 * competition_rate는 API 2 별도 호출 후 Wave 1(13-02)에서 UPDATE
 */
import type { CheongyakItem, NewListingCheongyakRow } from './types'

/**
 * 날짜 문자열을 ISO YYYY-MM-DD 형식으로 변환.
 * - YYYYMMDD (8자리) → YYYY-MM-DD
 * - 이미 YYYY-MM-DD → 그대로 반환
 * - undefined / null / 빈 문자열 → null
 */
export function parseDateStr(s: string | undefined | null): string | null {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (s.length === 8 && /^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }
  return null
}

/**
 * API 3 응답 1건을 new_listings 삽입용 행으로 정규화.
 * - subscrptAreaCode 앞 5자리 → sgg_code
 * - 날짜 필드 YYYYMMDD → ISO
 * - competition_rate는 포함하지 않음 (Wave 1 별도 UPDATE)
 */
export function normalizeCheongyakItem(item: CheongyakItem): NewListingCheongyakRow {
  const sggCode = item.subscrptAreaCode
    ? item.subscrptAreaCode.slice(0, 5)
    : null

  return {
    name:                item.pblancNm ?? '',
    region:              item.subscrptAreaCodeNm ?? '',
    pblanc_no:           item.pblancNo,
    pblanc_nm:           item.pblancNm ?? null,
    sgg_code:            sggCode,
    supply_region:       item.subscrptAreaCodeNm ?? null,
    supply_count:        item.gnrlSuplyHshldco ?? null,
    rcept_bgnde:         parseDateStr(item.rcptbgnde),
    rcept_endde:         parseDateStr(item.rcptendde),
    przwner_presnatn_de: parseDateStr(item.przwnerPresnatnDe),
    mvn_prearnge_ym:     item.mvnPrearngeMntdy ?? null,
    hssply_adres:        item.hssplyAdres ?? null,
    is_active:           true,
    fetched_at:          new Date().toISOString(),
  }
}
