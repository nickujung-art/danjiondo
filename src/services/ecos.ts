import 'server-only'

const ECOS_BASE = 'https://ecos.bok.or.kr/api'

// 예금은행 대출금리(신규취급액 기준) — 주택담보대출
const STAT_CODE  = '121Y006'
const ITEM_CODE  = 'BECBLA0302'

interface EcosRow {
  TIME:        string   // 'YYYYMM'
  DATA_VALUE:  string   // '3.5' (연%)
}

/**
 * 주택담보대출금리 최근 3개월 평균 반환 (연%).
 * ECOS API 장애 시 null 반환 (graceful degradation).
 */
export async function fetchMortgageRate(): Promise<number | null> {
  const key = process.env.ECOS_API_KEY
  if (!key) return null

  const now   = new Date()
  const start = `${now.getFullYear() - 1}01`
  const end   = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

  const url = `${ECOS_BASE}/StatisticSearch/${key}/json/kr/1/3/${STAT_CODE}/M/${start}/${end}/${ITEM_CODE}`

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    const json = await res.json()
    const rows: EcosRow[] = json?.StatisticSearch?.row ?? []
    if (!rows.length) return null
    // 가장 최근 달 금리 반환
    const latest = rows[rows.length - 1]!
    const rate = parseFloat(latest.DATA_VALUE)
    return isNaN(rate) ? null : rate
  } catch {
    return null
  }
}
