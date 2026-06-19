import 'server-only'

const ECOS_BASE = 'https://ecos.bok.or.kr/api'

// 예금은행 대출금리(신규취급액 기준) — 주택담보대출
const STAT_CODE  = '121Y006'
const ITEM_CODE  = 'BECBLA0302'

interface EcosRow {
  TIME:        string   // 'YYYYMM'
  DATA_VALUE:  string   // '3.5' (연%)
}

export interface MortgageRatePoint {
  yearMonth: string   // 'YYYY-MM'
  rate:      number   // 연%
}

/**
 * 주택담보대출금리 최근 3개월 평균 반환 (연%).
 * ECOS API 장애 시 null 반환 (graceful degradation).
 */
export async function fetchMortgageRate(): Promise<number | null> {
  const series = await fetchMortgageRateSeries(3)
  if (!series.length) return null
  return series[series.length - 1]!.rate
}

/**
 * 주택담보대출금리 월별 시계열 반환 (연%).
 * months: 최근 N개월 (최대 60).
 * ECOS API 장애 시 빈 배열 반환.
 */
export async function fetchMortgageRateSeries(months = 24): Promise<MortgageRatePoint[]> {
  const key = process.env.ECOS_API_KEY
  if (!key) return []

  const n   = Math.min(Math.max(months, 1), 60)
  const now = new Date()
  // 여유롭게 n+6개월 전부터 요청 (API 지연 대비)
  const startYear  = now.getFullYear() - Math.ceil((n + 6) / 12)
  const start      = `${startYear}01`
  const end        = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const limit      = n + 6

  const url = `${ECOS_BASE}/StatisticSearch/${key}/json/kr/1/${limit}/${STAT_CODE}/M/${start}/${end}/${ITEM_CODE}`

  try {
    const res = await fetch(url, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return []
    const json = await res.json()
    const rows: EcosRow[] = json?.StatisticSearch?.row ?? []
    return rows
      .map(r => ({
        yearMonth: `${r.TIME.slice(0, 4)}-${r.TIME.slice(4, 6)}`,
        rate:      parseFloat(r.DATA_VALUE),
      }))
      .filter(r => !isNaN(r.rate))
      .slice(-n)   // 요청 개월수만큼만
  } catch {
    return []
  }
}
