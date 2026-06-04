/**
 * 행정안전부_생활_체육도장업 조회서비스 어댑터
 * End Point: https://apis.data.go.kr/1741000/martial_arts_dojo/info
 * 인증키: MOLIT_API_KEY (data.go.kr 공용)
 * 갱신주기: 매일 (2일 전 기준), 배치는 월 1회로 충분
 */
import { z } from 'zod/v4'

const BASE = 'https://apis.data.go.kr/1741000/martial_arts_dojo/info'

// ─── 응답 스키마 ───────────────────────────────────────────────────────────────
// localdata 계열 API는 items.item 배열 또는 단일 객체, 빈 문자열 세 가지 경우가 있음

const ItemSchema = z.object({
  bizNm:       z.string(),
  uptaeNm:     z.string().default(''),
  rdnWhlAddr:  z.string().default(''),
  x:           z.string().optional().nullable(),
  y:           z.string().optional().nullable(),
  trdStateGbn: z.string().default(''),
  sigunNm:     z.string().optional().nullable(),
}).passthrough()

const ResponseSchema = z.object({
  response: z.object({
    header: z.object({ resultCode: z.string(), resultMsg: z.string() }),
    body: z.object({
      totalCount: z.coerce.number(),
      numOfRows:  z.coerce.number(),
      pageNo:     z.coerce.number(),
      items: z.union([
        z.object({ item: z.union([z.array(ItemSchema), ItemSchema]) }),
        z.string(),
        z.null(),
      ]).optional().nullable(),
    }),
  }),
})

export interface SportsFacilityItem {
  bizNm:    string
  uptaeNm:  string
  address:  string
  lng:      number | null
  lat:      number | null
}

// ─── 단일 페이지 fetch ─────────────────────────────────────────────────────────

async function fetchPage(
  sigunCd: string,
  pageNo: number,
  numOfRows: number,
): Promise<{ items: SportsFacilityItem[]; totalCount: number }> {
  const key = process.env.MOLIT_API_KEY
  if (!key) throw new Error('MOLIT_API_KEY not set')

  const url = new URL(BASE)
  url.searchParams.set('serviceKey',  key)
  url.searchParams.set('pageNo',      String(pageNo))
  url.searchParams.set('numOfRows',   String(numOfRows))
  url.searchParams.set('type',        'json')
  url.searchParams.set('sigunCd',     sigunCd)
  url.searchParams.set('trdStateGbn', '01')  // 영업중만

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`martial_arts_dojo HTTP ${res.status}`)

  const json = await res.json()

  // API 파라미터 불일치 등 디버깅용 — 첫 페이지 첫 호출 시 raw 확인
  if (pageNo === 1 && process.env.DEBUG_SPORTS_API) {
    console.log('[DEBUG] raw response:', JSON.stringify(json).slice(0, 500))
  }

  const parsed = ResponseSchema.parse(json)
  const { body } = parsed.response

  if (!body.items || typeof body.items === 'string' || body.items === null) {
    return { items: [], totalCount: body.totalCount ?? 0 }
  }

  const rawItems = Array.isArray(body.items.item)
    ? body.items.item
    : [body.items.item]

  const items: SportsFacilityItem[] = rawItems
    .filter(it => it.trdStateGbn === '01')
    .map(it => ({
      bizNm:   it.bizNm.trim(),
      uptaeNm: it.uptaeNm.trim(),
      address: it.rdnWhlAddr.trim(),
      lng:     it.x ? parseFloat(it.x) || null : null,
      lat:     it.y ? parseFloat(it.y) || null : null,
    }))
    .filter(it => it.bizNm.length > 0)

  return { items, totalCount: body.totalCount }
}

// ─── 전체 페이지 수집 ──────────────────────────────────────────────────────────

export async function fetchAllSportsFacilities(
  sigunCd: string,
): Promise<SportsFacilityItem[]> {
  const PAGE_SIZE = 1000
  const first = await fetchPage(sigunCd, 1, PAGE_SIZE)
  const allItems = [...first.items]

  const totalPages = Math.ceil(first.totalCount / PAGE_SIZE)
  for (let page = 2; page <= totalPages; page++) {
    const { items } = await fetchPage(sigunCd, page, PAGE_SIZE)
    allItems.push(...items)
  }

  return allItems
}
