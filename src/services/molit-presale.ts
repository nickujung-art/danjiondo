import { z } from 'zod/v4'

const BASE_URL =
  'https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade'

const PresaleTradeSchema = z.object({
  aptNm: z.string(),
  umdNm: z.string(),
  dealAmount: z.string(), // "15,000" 형식 문자열
  excluUseAr: z.coerce.number().optional(),
  floor: z.coerce.number().optional(),
  dealYear: z.string(),
  dealMonth: z.string(),
  dealDay: z.string(),
  cdealType: z.string().optional(), // 'Y'이면 취소 거래
})

export type PresaleTrade = z.infer<typeof PresaleTradeSchema>

function parseXmlItems(xml: string): unknown[] {
  // Node.js 내장 방식으로 XML에서 <item> 블록 추출
  // fast-xml-parser 없이 구현
  const items: unknown[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] ?? ''
    const obj: Record<string, string> = {}
    const fieldRegex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g
    let fieldMatch: RegExpExecArray | null
    while ((fieldMatch = fieldRegex.exec(block)) !== null) {
      const key = fieldMatch[1] ?? fieldMatch[3]
      const value = (fieldMatch[2] ?? fieldMatch[4] ?? '').trim()
      if (key && value) obj[key] = value
    }
    if (Object.keys(obj).length > 0) items.push(obj)
  }
  return items
}

export async function fetchPresaleTrades(
  lawdCd: string,
  dealYmd: string, // YYYYMM
): Promise<PresaleTrade[]> {
  const apiKey = process.env.MOLIT_API_KEY
  if (!apiKey) throw new Error('MOLIT_API_KEY not set')

  const url = new URL(BASE_URL)
  url.searchParams.set('serviceKey', apiKey)
  url.searchParams.set('LAWD_CD', lawdCd)
  url.searchParams.set('DEAL_YMD', dealYmd)
  url.searchParams.set('numOfRows', '1000')

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/xml' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`MOLIT API ${res.status}`)

  const xml = await res.text()
  const items = parseXmlItems(xml)
  const results: PresaleTrade[] = []
  for (const item of items) {
    const parsed = PresaleTradeSchema.safeParse(item)
    if (parsed.success) results.push(parsed.data)
  }
  return results
}

// 가격 파싱 헬퍼: "15,000" → 15000 (만원)
export function parseAmount(raw: string): number {
  return parseInt(raw.replace(/,/g, ''), 10) || 0
}

// 현재월 YYYYMM
export function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}
