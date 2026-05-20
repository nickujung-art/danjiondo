/**
 * 청약홈 API (data.go.kr B552555) 어댑터
 * API 3: /getAPTLttotPblancList (분양정보 조회) — fetchCheongyakList
 * API 2: /getAPTRcritPblancList (청약경쟁률 조회) — fetchCompetitionRate
 * 환경변수: MOLIT_API_KEY (data.go.kr 발급)
 */
import { withRetry } from '@/lib/api/retry'
import {
  CheongyakItemSchema,
  CompetitionRateItemSchema,
  type CheongyakItem,
  type CompetitionRateItem,
} from './types'

const BASE_LIST_URL =
  'https://apis.data.go.kr/B552555/APTLttotPblancDetail/getAPTLttotPblancList'
const BASE_RATE_URL =
  'https://apis.data.go.kr/B552555/APTRcritPblancDetail/getAPTRcritPblancList'

const ROWS_PER_PAGE = 100
// 경남 2개 sgg × 100rows × 5pages = 최대 1000건 (DoS 보호 — T-13-06)
const MAX_PAGES = 5

/** 창원(4812500000), 김해(4825000000) 법정동코드 */
export const CHEONGYAK_SGG_CODES = ['4812500000', '4825000000'] as const

/** API 응답 items.item 필드 정규화 (단건 객체 → 배열) */
function normalizeItems(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') return []
  const item = (raw as Record<string, unknown>).item
  if (!item) return []
  return Array.isArray(item) ? item : [item]
}

async function fetchListPage(
  sggCode: string,
  page: number,
): Promise<{ items: CheongyakItem[]; totalCount: number }> {
  const apiKey = process.env.MOLIT_API_KEY
  if (!apiKey) throw new Error('MOLIT_API_KEY not set')

  const url = new URL(BASE_LIST_URL)
  url.searchParams.set('ServiceKey', apiKey)
  url.searchParams.set('RoadNmSggCd', sggCode)
  url.searchParams.set('pageNo', String(page))
  url.searchParams.set('numOfRows', String(ROWS_PER_PAGE))
  url.searchParams.set('_type', 'json')

  return withRetry(async () => {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      throw Object.assign(new Error(`Cheongyak API ${res.status}`), { status: res.status })
    }
    const json: unknown = await res.json()
    const body = (json as { response?: { body?: unknown } })?.response?.body
    const totalCount =
      (body as { totalCount?: number } | undefined)?.totalCount ?? 0
    const rawItems = normalizeItems(
      (body as { items?: unknown } | undefined)?.items,
    )
    const items: CheongyakItem[] = []
    for (const raw of rawItems) {
      const parsed = CheongyakItemSchema.safeParse(raw)
      if (parsed.success) items.push(parsed.data)
    }
    return { items, totalCount }
  })
}

/**
 * API 3: 지역코드(sggCode)로 분양 공고 목록을 전체 페이지 수집.
 * totalCount 기반 자동 페이지네이션 (최대 MAX_PAGES=5 페이지).
 */
export async function fetchCheongyakList(sggCode: string): Promise<CheongyakItem[]> {
  const all: CheongyakItem[] = []
  const first = await fetchListPage(sggCode, 1)
  all.push(...first.items)
  const totalPages = Math.min(
    MAX_PAGES,
    Math.ceil(first.totalCount / ROWS_PER_PAGE),
  )
  for (let page = 2; page <= totalPages; page++) {
    const result = await fetchListPage(sggCode, page)
    all.push(...result.items)
  }
  return all
}

/**
 * API 2: 공고번호(pblancNo)로 주택형별 경쟁률을 조회하고 최댓값 반환.
 * 데이터 없으면 null. 경쟁률 집계 방식: MAX (CONTEXT.md 확정 — 카드에 "최고 경쟁률 X:1" 표시 목적).
 */
export async function fetchCompetitionRate(pblancNo: string): Promise<number | null> {
  const apiKey = process.env.MOLIT_API_KEY
  if (!apiKey) throw new Error('MOLIT_API_KEY not set')

  const url = new URL(BASE_RATE_URL)
  url.searchParams.set('ServiceKey', apiKey)
  url.searchParams.set('PBLANC_NO', pblancNo)
  url.searchParams.set('numOfRows', '50')
  url.searchParams.set('_type', 'json')

  return withRetry(async () => {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      throw Object.assign(new Error(`Cheongyak API ${res.status}`), { status: res.status })
    }
    const json: unknown = await res.json()
    const body = (json as { response?: { body?: unknown } })?.response?.body
    const rawItems = normalizeItems(
      (body as { items?: unknown } | undefined)?.items,
    )
    if (rawItems.length === 0) return null

    const items: CompetitionRateItem[] = []
    for (const raw of rawItems) {
      const parsed = CompetitionRateItemSchema.safeParse(raw)
      if (parsed.success) items.push(parsed.data)
    }

    const rates = items
      .map(i => i.gnrlRnk1CrsplApplCnt)
      .filter((r): r is number => typeof r === 'number')
    if (rates.length === 0) return null
    return Math.max(...rates)
  })
}
