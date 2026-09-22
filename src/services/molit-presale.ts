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

/**
 * MOLIT(공공데이터포털) API 실패. 상태 코드와 본문의 errMsg 를 함께 들고 있다.
 *
 * `isAccountLevel` 은 **지역을 바꿔도 결과가 같은 실패**를 뜻한다. 서비스키가
 * 그 API 에 등록되지 않은 경우가 대표적이며(returnReasonCode=30), 이때 38개
 * 지역을 모두 두드리면 똑같은 오류 38건과 낭비된 요청만 남는다.
 */
export class MolitApiError extends Error {
  readonly status: number
  readonly errCode?: string

  constructor(message: string, status: number, errCode?: string) {
    super(message)
    this.name = 'MolitApiError'
    this.status = status
    this.errCode = errCode
  }

  get isAccountLevel(): boolean {
    return this.status === 403 || this.errCode === 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR'
  }
}

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
  if (!res.ok) {
    // 상태 코드만 던지면 원인을 알 수 없다. 2026-09-17~22에 daily-batch 가
    // "MOLIT API 403" 38건만 남겨, 키가 막힌 것인지 지역이 잘못된 것인지
    // 구분할 수 없었다. data.go.kr 은 사유를 본문에 담아 준다 — 그걸 올린다.
    const body = await res.text().catch(() => '')
    const errCode = body.match(/<errMsg>(.*?)<\/errMsg>/)?.[1]
    const authMsg = body.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/)?.[1]
    const detail = [errCode, authMsg].filter(Boolean).join(' / ')
    throw new MolitApiError(
      `MOLIT API ${res.status}${detail ? ` — ${detail}` : ''}`,
      res.status,
      errCode,
    )
  }

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

/**
 * 전월 YYYYMM. 신고 지연 때문에 M 월 거래가 M+1 월에 들어오므로, 일배치는 당월만이
 * 아니라 전월도 함께 훑어야 한다(molit-daily.yml 이 아파트에 대해 이미 그렇게 한다).
 *
 * `new Date(y, m - 1, 1)` 로 만든다 — 월 인덱스가 음수여도 Date 가 연도를 자동으로
 * 넘겨주므로 1월에 12월/전년으로 정확히 떨어진다.
 */
export function previousYearMonth(): string {
  const d = new Date()
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  return `${p.getFullYear()}${String(p.getMonth() + 1).padStart(2, '0')}`
}
