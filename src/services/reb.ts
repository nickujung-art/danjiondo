import 'server-only'

const REB_BASE   = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do'
const SALE_TBL   = 'A_2024_00045'   // (월) 매매가격지수_아파트
const JEONSE_TBL = 'A_2024_00050'   // (월) 전세가격지수_아파트
const NATION_CLS = 500001            // 전국

// sgg_code → R-ONE CLS_ID 매핑 (구 레벨 없으면 시 레벨로 대체)
export const SGG_TO_REB_CLS: Record<string, { clsId: number; level: 'gu' | 'si' }> = {
  '48121': { clsId: 520171, level: 'gu' },   // 창원 의창구
  '48123': { clsId: 510111, level: 'si' },   // 창원 창원구 → 창원시 대체
  '48125': { clsId: 520172, level: 'gu' },   // 창원 성산구
  '48127': { clsId: 520173, level: 'gu' },   // 창원 마산합포구
  '48128': { clsId: 520174, level: 'gu' },   // 창원 마산회원구
  '48129': { clsId: 520175, level: 'gu' },   // 창원 진해구
  '48250': { clsId: 510115, level: 'si' },   // 김해시
}

export interface PriceIndexPoint {
  yearMonth: string          // 'YYYY-MM'
  saleIdx:   number | null   // 매매가격지수 (2019=100)
  jeonseIdx: number | null   // 전세가격지수 (2019=100)
}

async function fetchOneIdx(clsId: number, statblId: string, ym: string): Promise<number | null> {
  const url =
    `${REB_BASE}?STATBL_ID=${statblId}&DTACYCLE_CD=MM` +
    `&WRTTIME_IDTFR_ID=${ym}&Type=json&CLS_ID=${clsId}`
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    const j = await res.json()
    const row = (j.SttsApiTblData?.[1]?.row ?? [])[0]
    const v = row?.DTA_VAL
    return v != null ? Number(v) : null
  } catch {
    return null
  }
}

function recentYearMonths(months: number): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return result
}

export interface PriceIndexSeries {
  regional:    PriceIndexPoint[]   // 지역 매매+전세
  national:    PriceIndexPoint[]   // 전국 매매
  clsId:       number
  level:       'gu' | 'si'
}

/**
 * 지역 + 전국 아파트 매매/전세가격지수 시계열.
 * 달별 병렬 fetch, 24시간 캐시.
 * 미발표 달(DTA_VAL null)은 필터링.
 */
export async function fetchPriceIndexSeries(
  sggCode: string,
  months = 24,
): Promise<PriceIndexSeries | null> {
  const mapping = SGG_TO_REB_CLS[sggCode]
  if (!mapping) return null

  const ymList = recentYearMonths(months)

  // 달별로 지역매매, 지역전세, 전국매매 병렬 fetch
  const rawRows = await Promise.all(
    ymList.map(async ym => {
      const [sale, jeonse, natSale] = await Promise.all([
        fetchOneIdx(mapping.clsId, SALE_TBL,   ym),
        fetchOneIdx(mapping.clsId, JEONSE_TBL, ym),
        fetchOneIdx(NATION_CLS,    SALE_TBL,   ym),
      ])
      return {
        yearMonth: `${ym.slice(0, 4)}-${ym.slice(4)}`,
        sale, jeonse, natSale,
      }
    }),
  )

  const regional = rawRows
    .filter(r => r.sale != null || r.jeonse != null)
    .map(r => ({ yearMonth: r.yearMonth, saleIdx: r.sale, jeonseIdx: r.jeonse }))

  const national = rawRows
    .filter(r => r.natSale != null)
    .map(r => ({ yearMonth: r.yearMonth, saleIdx: r.natSale, jeonseIdx: null }))

  return { regional, national, clsId: mapping.clsId, level: mapping.level }
}
