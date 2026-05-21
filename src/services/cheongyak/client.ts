/**
 * 청약홈 API (api.odcloud.kr ApplyhomeInfoDetailSvc) 어댑터
 * APT 분양정보: /ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail
 * 청약경쟁률: /ApplyhomeRcritPblancSvc/v1/getAPTRcritPblancDetail
 * 환경변수: MOLIT_API_KEY (odcloud.kr 발급 일반 인증키)
 */
import { withRetry } from '@/lib/api/retry'
import {
  CheongyakItemSchema,
  CompetitionRateItemSchema,
  type CheongyakItem,
  type CompetitionRateItem,
} from './types'

const BASE_LIST_URL =
  'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail'
const BASE_RATE_URL =
  'https://api.odcloud.kr/api/ApplyhomeInfoCmpetRtSvc/v1/getAPTLttotPblancCmpet'

const ROWS_PER_PAGE = 100
// 전체 조회 후 클라이언트 필터링 — 최대 10페이지 (DoS 보호 — T-13-06)
const MAX_PAGES = 10

/** 경남 지역코드 (odcloud.kr 기준 — 창원·김해 포함) */
const GYEONGNAM_CODE = '621'

/** 창원·김해만 필터 — HSSPLY_ADRES 주소 기반 */
export const CHEONGYAK_CITIES = ['창원', '김해'] as const

/** odcloud.kr API 응답 data 배열 추출 */
function normalizeData(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') return []
  const data = (raw as Record<string, unknown>).data
  if (Array.isArray(data)) return data
  return []
}

async function fetchListPage(
  page: number,
): Promise<{ items: CheongyakItem[]; totalCount: number }> {
  const apiKey = process.env.MOLIT_API_KEY
  if (!apiKey) throw new Error('MOLIT_API_KEY not set')

  const url = new URL(BASE_LIST_URL)
  url.searchParams.set('serviceKey', apiKey)
  url.searchParams.set('page', String(page))
  url.searchParams.set('perPage', String(ROWS_PER_PAGE))
  url.searchParams.set('returnType', 'json')
  url.searchParams.set('cond[SUBSCRPT_AREA_CODE::EQ]', GYEONGNAM_CODE)

  return withRetry(async () => {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw Object.assign(
        new Error(`Cheongyak API ${res.status}: ${body.slice(0, 200)}`),
        { status: res.status },
      )
    }
    const json: unknown = await res.json()
    const totalCount = (json as { totalCount?: number })?.totalCount ?? 0
    const rawItems = normalizeData(json)
    const items: CheongyakItem[] = []
    for (const raw of rawItems) {
      const parsed = CheongyakItemSchema.safeParse(raw)
      if (parsed.success) items.push(parsed.data)
    }
    return { items, totalCount }
  })
}

/**
 * 경남(621) 분양 공고 조회 후 창원·김해 주소 필터링.
 * 서버 필터: cond[SUBSCRPT_AREA_CODE::EQ]=621
 * 클라이언트 필터: HSSPLY_ADRES에 '창원' 또는 '김해' 포함 여부
 */
export async function fetchCheongyakList(_sggCode?: string): Promise<CheongyakItem[]> {
  const all: CheongyakItem[] = []
  const first = await fetchListPage(1)
  all.push(...first.items)
  const totalPages = Math.min(
    MAX_PAGES,
    Math.ceil(first.totalCount / ROWS_PER_PAGE),
  )
  for (let page = 2; page <= totalPages; page++) {
    const result = await fetchListPage(page)
    all.push(...result.items)
  }
  return all.filter(item =>
    CHEONGYAK_CITIES.some(city => item.HSSPLY_ADRES?.includes(city)),
  )
}

/**
 * 공고번호(pblancNo)로 주택형별 경쟁률을 조회하고 최댓값 반환.
 * 데이터 없으면 null. 경쟁률 집계 방식: MAX (카드에 "최고 경쟁률 X:1" 표시 목적).
 */
export async function fetchCompetitionRate(pblancNo: string): Promise<number | null> {
  const apiKey = process.env.MOLIT_API_KEY
  if (!apiKey) throw new Error('MOLIT_API_KEY not set')

  const url = new URL(BASE_RATE_URL)
  url.searchParams.set('serviceKey', apiKey)
  url.searchParams.set('cond[PBLANC_NO::EQ]', pblancNo)
  url.searchParams.set('perPage', '50')
  url.searchParams.set('returnType', 'json')

  return withRetry(async () => {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw Object.assign(
        new Error(`Cheongyak API ${res.status}: ${body.slice(0, 200)}`),
        { status: res.status },
      )
    }
    const json: unknown = await res.json()
    const rawItems = normalizeData(json)
    if (rawItems.length === 0) return null

    const items: CompetitionRateItem[] = []
    for (const raw of rawItems) {
      const parsed = CompetitionRateItemSchema.safeParse(raw)
      if (parsed.success) items.push(parsed.data)
    }

    const rates = items
      .map(i => i.CMPET_RATE)
      .filter((r): r is number => typeof r === 'number')
    if (rates.length === 0) return null
    return Math.max(...rates)
  })
}
