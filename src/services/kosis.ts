import 'server-only'

const KOSIS_BASE = 'https://kosis.kr/openapi/Param/statisticsParameterData.do'

// 행정구역(시군구)별, 성별 인구수
const ORG_ID  = '101'
const TBL_ID  = 'DT_1B040A3'
const ITM_ID  = 'T20'  // 총인구수

export interface KosisPopulationRow {
  sggCode:    string   // 5자리 시군구 코드 (예: '48121')
  sggName:    string   // 시군구명 (예: '의창구')
  year:       number   // 연도
  population: number   // 총인구수 (명)
}

/**
 * KOSIS에서 시군구별 연도별 인구수 조회.
 * 장애 시 빈 배열 반환.
 */
export async function fetchPopulationBySgg(
  sggCodes: string[],
  years = 10,
): Promise<KosisPopulationRow[]> {
  const key = process.env.KOSIS_API_KEY
  if (!key || sggCodes.length === 0) return []

  const objL1 = sggCodes.map(c => c).join('+') + '+'

  const url =
    `${KOSIS_BASE}?method=getList` +
    `&apiKey=${encodeURIComponent(key)}` +
    `&orgId=${ORG_ID}&tblId=${TBL_ID}` +
    `&itmId=${ITM_ID}+` +
    `&objL1=${objL1}` +
    `&objL2=&objL3=&objL4=&objL5=&objL6=&objL7=&objL8=` +
    `&format=json&jsonVD=Y` +
    `&prdSe=Y&newEstPrdCnt=${years}`

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const json = await res.json()
    if (!Array.isArray(json)) return []

    return (json as Record<string, string>[])
      .filter(r => r['ITM_ID'] === 'T20' && r['DT'] && r['C1'] && r['C1_NM'])
      .map(r => ({
        sggCode:    r['C1']!,
        sggName:    r['C1_NM']!,
        year:       Number(r['PRD_DE']),
        population: Number(r['DT']),
      }))
      .filter(r => !isNaN(r.year) && !isNaN(r.population))
      .sort((a, b) => a.sggCode.localeCompare(b.sggCode) || a.year - b.year)
  } catch {
    return []
  }
}
