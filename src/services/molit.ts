/**
 * 국토부 실거래가 API 어댑터 (얇은 래퍼 — 비즈니스 로직 없음)
 * 승인 API: 아파트매매 실거래가 상세 자료(Dev) + 아파트전월세 실거래가 자료
 *           연립다세대 매매 실거래가 자료 + 연립다세대 전월세 실거래가 자료
 * 응답 필드 확인: 2026-04-30 기준 영문 필드명
 */
import { z } from 'zod/v4'
import { withRetry } from '@/lib/api/retry'

const BASE_SALE = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev'
const BASE_RENT = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent'

// 연립다세대 엔드포인트
const BASE_VILLA_SALE = 'https://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade'
const BASE_VILLA_RENT = 'https://apis.data.go.kr/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent'
const ROWS_PER_PAGE = 100

// ── Zod 스키마 ──────────────────────────────────────────────

export const MolitSaleItemSchema = z.object({
  aptNm:      z.string(),
  aptSeq:     z.string().optional(),              // "48121-792" 단지코드
  dealAmount: z.string(),                         // "49,700" (만원)
  dealDay:    z.coerce.number().int(),
  dealMonth:  z.coerce.number().int(),
  dealYear:   z.coerce.number().int(),
  excluUseAr: z.coerce.number(),                  // 전용면적 m²
  floor:      z.coerce.number().int(),
  sggCd:      z.coerce.number().int(),            // 5자리 지역코드 (숫자)
  buildYear:  z.coerce.number().int().optional(),
  cdealType:  z.string().optional(),              // 해제사유 (" "=정상)
  cdealDay:   z.string().optional(),              // 해제일
  roadNm:     z.string().optional(),
  umdNm:      z.string().optional(),
  jibun:      z.coerce.string().optional(),
  dealingGbn: z.string().optional(),              // 중개거래/직거래
})

export type MolitSaleItem = z.infer<typeof MolitSaleItemSchema>

export const MolitRentItemSchema = z.object({
  aptNm:       z.string(),
  aptSeq:      z.string().optional(),
  deposit:     z.string(),                        // 보증금 "48,000" (만원)
  monthlyRent: z.coerce.number().optional(),      // 월세 (0 = 전세)
  dealDay:     z.coerce.number().int(),
  dealMonth:   z.coerce.number().int(),
  dealYear:    z.coerce.number().int(),
  excluUseAr:  z.coerce.number(),
  floor:       z.coerce.number().int(),
  sggCd:       z.coerce.number().int(),
  buildYear:   z.coerce.number().int().optional(),
  contractType: z.string().optional(),            // 계약구분 (신규/갱신)
  contractTerm: z.string().optional(),
  useRRRight:  z.string().optional(),
  roadnm:      z.string().optional(),             // 전월세는 소문자
  umdNm:       z.string().optional(),
  jibun:       z.coerce.string().optional(),
})

export type MolitRentItem = z.infer<typeof MolitRentItemSchema>

export interface MolitPage<T> {
  items: T[]
  totalCount: number
}

// ── 공통 fetch 헬퍼 ─────────────────────────────────────────

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
): Promise<MolitPage<T>> {
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
      headers: {
        Accept:     'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const err = Object.assign(new Error(`MOLIT API ${res.status}`), { status: res.status })
      throw err
    }

    const json: unknown = await res.json()
    const body = (json as { response?: { body?: unknown } })?.response?.body
    const totalCount: number =
      (body as { totalCount?: number } | undefined)?.totalCount ?? 0
    const rawItems = normalizeItems(
      (body as { items?: unknown } | undefined)?.items,
    )

    const items: T[] = []
    for (const raw of rawItems) {
      const parsed = schema.safeParse(raw)
      if (parsed.success) items.push(parsed.data)
    }

    return { items, totalCount }
  })
}

// ── 연립다세대 Zod 스키마 ────────────────────────────────────

export const MolitVillaSaleItemSchema = z.object({
  mhouseNm:   z.string(),                          // 연립다세대 건물명
  dealAmount: z.string(),                          // "49,700" (만원)
  dealDay:    z.coerce.number().int(),
  dealMonth:  z.coerce.number().int(),
  dealYear:   z.coerce.number().int(),
  excluUseAr: z.coerce.number(),                   // 전용면적 m²
  floor:      z.coerce.number().int(),
  sggCd:      z.coerce.number().int(),             // 5자리 지역코드 (숫자)
  buildYear:  z.coerce.number().int().optional(),
  cdealType:  z.string().optional(),               // 해제사유 (" "=정상)
  cdealDay:   z.string().optional(),               // 해제일
  roadNm:     z.string().optional(),
  umdNm:      z.string().optional(),
  jibun:      z.coerce.string().optional(),
  dealingGbn: z.string().optional(),               // 중개거래/직거래
})

export type MolitVillaSaleItem = z.infer<typeof MolitVillaSaleItemSchema>

export const MolitVillaRentItemSchema = z.object({
  mhouseNm:     z.string(),
  deposit:      z.string(),                        // 보증금 "48,000" (만원)
  monthlyRent:  z.coerce.number().optional(),      // 월세 (0 = 전세)
  dealDay:      z.coerce.number().int(),
  dealMonth:    z.coerce.number().int(),
  dealYear:     z.coerce.number().int(),
  excluUseAr:   z.coerce.number(),
  floor:        z.coerce.number().int(),
  sggCd:        z.coerce.number().int(),
  buildYear:    z.coerce.number().int().optional(),
  contractType: z.string().optional(),             // 계약구분 (신규/갱신)
  contractTerm: z.string().optional(),
  umdNm:        z.string().optional(),
  jibun:        z.coerce.string().optional(),
})

export type MolitVillaRentItem = z.infer<typeof MolitVillaRentItemSchema>

// ── 공개 API ───────────────────────────────────────────────

export function fetchSalePage(
  sggCode: string,
  yearMonth: string,
  page: number,
): Promise<MolitPage<MolitSaleItem>> {
  return fetchPage(BASE_SALE, sggCode, yearMonth, page, MolitSaleItemSchema)
}

export function fetchRentPage(
  sggCode: string,
  yearMonth: string,
  page: number,
): Promise<MolitPage<MolitRentItem>> {
  return fetchPage(BASE_RENT, sggCode, yearMonth, page, MolitRentItemSchema)
}

export function fetchVillaSalePage(
  sggCode: string,
  yearMonth: string,
  page: number,
): Promise<MolitPage<MolitVillaSaleItem>> {
  return fetchPage(BASE_VILLA_SALE, sggCode, yearMonth, page, MolitVillaSaleItemSchema)
}

export function fetchVillaRentPage(
  sggCode: string,
  yearMonth: string,
  page: number,
): Promise<MolitPage<MolitVillaRentItem>> {
  return fetchPage(BASE_VILLA_RENT, sggCode, yearMonth, page, MolitVillaRentItemSchema)
}
