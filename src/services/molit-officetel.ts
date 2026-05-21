/**
 * 국토부 오피스텔 실거래가 API 어댑터
 * 승인 API: 오피스텔매매 실거래가 자료 + 오피스텔전월세 실거래가 자료
 * 응답 필드 확인: 2026-05-21 기준 영문 필드명 (APT와 동일 구조, aptNm → offiNm)
 */
import { z } from 'zod/v4'
import { withRetry } from '@/lib/api/retry'

const BASE_SALE = 'https://apis.data.go.kr/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade'
const BASE_RENT = 'https://apis.data.go.kr/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent'
const ROWS_PER_PAGE = 100

// ── Zod 스키마 ──────────────────────────────────────────────

export const OffiSaleItemSchema = z.object({
  offiNm:     z.string(),                         // 오피스텔명 (APT의 aptNm 대응)
  dealAmount: z.string(),                         // "68,000" (만원)
  dealDay:    z.coerce.number().int(),
  dealMonth:  z.coerce.number().int(),
  dealYear:   z.coerce.number().int(),
  excluUseAr: z.coerce.number(),                  // 전용면적 m²
  floor:      z.coerce.number().int(),
  sggCd:      z.coerce.number().int(),            // 5자리 지역코드
  buildYear:  z.coerce.number().int().optional(),
  cdealType:  z.string().optional(),              // 해제사유 (" "=정상)
  cdealDay:   z.string().optional(),
  roadNm:     z.string().optional(),
  umdNm:      z.string().optional(),
  jibun:      z.coerce.string().optional(),
  dealingGbn: z.string().optional(),
})

export type OffiSaleItem = z.infer<typeof OffiSaleItemSchema>

export const OffiRentItemSchema = z.object({
  offiNm:      z.string(),
  deposit:     z.string(),                        // 보증금 "48,000" (만원)
  monthlyRent: z.coerce.number().optional(),      // 월세 (0 = 전세)
  dealDay:     z.coerce.number().int(),
  dealMonth:   z.coerce.number().int(),
  dealYear:    z.coerce.number().int(),
  excluUseAr:  z.coerce.number(),
  floor:       z.coerce.number().int(),
  sggCd:       z.coerce.number().int(),
  buildYear:   z.coerce.number().int().optional(),
  contractType: z.string().optional(),
  contractTerm: z.string().optional(),
  roadNm:      z.string().optional(),
  umdNm:       z.string().optional(),
  jibun:       z.coerce.string().optional(),
})

export type OffiRentItem = z.infer<typeof OffiRentItemSchema>

export interface OffiPage<T> {
  items: T[]
  totalCount: number
}

// ── 공통 fetch 헬퍼 ─────────────────────────────────────────
// APT molit.ts와 동일 구조 (LAWD_CD, DEAL_YMD, pageNo, numOfRows, _type)

function normalizeItems(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') return []
  const item = (raw as Record<string, unknown>).item
  if (!item) return []
  return Array.isArray(item) ? item : [item]
}

async function fetchPage<T>(
  baseUrl: string,
  sggCode: string,
  yearMonth: string,
  page: number,
  schema: z.ZodType<T>,
): Promise<OffiPage<T>> {
  const apiKey = process.env.MOLIT_API_KEY
  if (!apiKey) throw new Error('MOLIT_API_KEY is not set')

  const url = new URL(baseUrl)
  url.searchParams.set('ServiceKey', apiKey)
  url.searchParams.set('LAWD_CD', sggCode)
  url.searchParams.set('DEAL_YMD', yearMonth)
  url.searchParams.set('pageNo', String(page))
  url.searchParams.set('numOfRows', String(ROWS_PER_PAGE))
  url.searchParams.set('_type', 'json')

  return withRetry(async () => {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      throw Object.assign(new Error(`MOLIT Offi API ${res.status}`), { status: res.status })
    }

    const json: unknown = await res.json()
    const body = (json as { response?: { body?: unknown } })?.response?.body
    const totalCount: number = (body as { totalCount?: number } | undefined)?.totalCount ?? 0
    const rawItems = normalizeItems((body as { items?: unknown } | undefined)?.items)

    const items: T[] = []
    for (const raw of rawItems) {
      const parsed = schema.safeParse(raw)
      if (parsed.success) items.push(parsed.data)
    }

    return { items, totalCount }
  })
}

// ── 공개 API ───────────────────────────────────────────────

export function fetchOffiSalePage(
  sggCode: string,
  yearMonth: string,
  page: number,
): Promise<OffiPage<OffiSaleItem>> {
  return fetchPage(BASE_SALE, sggCode, yearMonth, page, OffiSaleItemSchema)
}

export function fetchOffiRentPage(
  sggCode: string,
  yearMonth: string,
  page: number,
): Promise<OffiPage<OffiRentItem>> {
  return fetchPage(BASE_RENT, sggCode, yearMonth, page, OffiRentItemSchema)
}
