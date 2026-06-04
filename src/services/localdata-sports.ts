/**
 * 행정안전부_생활_체육도장업 조회서비스 어댑터
 * End Point: https://apis.data.go.kr/1741000/martial_arts_dojo/info
 * 인증키: MOLIT_API_KEY (data.go.kr 공용)
 * 갱신주기: 매일 (2일 전 기준)
 *
 * 특이사항:
 * - numOfRows 최대 100 (더 크게 설정해도 100만 반환)
 * - 지역 필터(sigunCd 등) 미작동 → 전국 수집 후 주소 필터링
 * - CRD_INFO_X/Y는 TM 좌표 (WGS84 아님) → 카카오 지오코딩 사용
 */
import { z } from 'zod/v4'

const BASE = 'https://apis.data.go.kr/1741000/martial_arts_dojo/info'
const PAGE_SIZE = 100  // API 최대값

const ItemSchema = z.object({
  BPLC_NM:         z.string(),                        // 사업장명
  BZSTAT_SE_NM:    z.string().default(''),            // 업태명 (태권도, 검도, 유도 등)
  ROAD_NM_ADDR:    z.string().default(''),            // 도로명전체주소
  SALS_STTS_CD:    z.string().default(''),            // 영업상태코드 (01=영업중)
  DTL_SALS_STTS_NM: z.string().default(''),          // 영업상태명
}).passthrough()

const BodySchema = z.object({
  totalCount: z.coerce.number(),
  numOfRows:  z.coerce.number(),
  pageNo:     z.coerce.number(),
  items: z.union([
    z.object({ item: z.union([z.array(ItemSchema), ItemSchema]) }),
    z.string(),
    z.null(),
  ]).optional().nullable(),
})

const ResponseSchema = z.object({
  response: z.object({
    header: z.object({ resultCode: z.string(), resultMsg: z.string() }),
    body: BodySchema,
  }),
})

export interface SportsFacilityItem {
  bizNm:    string  // 사업장명 (BPLC_NM)
  uptaeNm:  string  // 업태명 (BZSTAT_SE_NM)
  address:  string  // 도로명주소 (ROAD_NM_ADDR)
}

// ─── 단일 페이지 fetch ─────────────────────────────────────────────────────────

async function fetchPage(pageNo: number): Promise<{
  items: SportsFacilityItem[]
  totalCount: number
}> {
  const key = process.env.MOLIT_API_KEY
  if (!key) throw new Error('MOLIT_API_KEY not set')

  const url = new URL(BASE)
  url.searchParams.set('serviceKey', key)
  url.searchParams.set('pageNo',     String(pageNo))
  url.searchParams.set('numOfRows',  String(PAGE_SIZE))
  url.searchParams.set('type',       'json')

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`martial_arts_dojo HTTP ${res.status}`)

  const parsed = ResponseSchema.parse(await res.json())
  const { body } = parsed.response

  if (!body.items || typeof body.items === 'string' || body.items === null) {
    return { items: [], totalCount: body.totalCount ?? 0 }
  }

  const rawItems = Array.isArray(body.items.item)
    ? body.items.item
    : [body.items.item]

  const items: SportsFacilityItem[] = rawItems
    .filter(it => it.SALS_STTS_CD === '01' || it.DTL_SALS_STTS_NM === '영업중')
    .map(it => ({
      bizNm:   it.BPLC_NM.trim(),
      uptaeNm: it.BZSTAT_SE_NM.trim(),
      address: it.ROAD_NM_ADDR.trim(),
    }))
    .filter(it => it.bizNm.length > 0)

  return { items, totalCount: body.totalCount }
}

// ─── 전국 수집 후 지역 필터 ────────────────────────────────────────────────────
// 지역 필터 파라미터 미작동 → 전국 327페이지 수집, 주소로 필터링

export async function fetchSportsFacilitiesByAddress(
  addressKeywords: string[],  // 예: ['창원', '김해']
  onProgress?: (page: number, total: number) => void,
): Promise<SportsFacilityItem[]> {
  const first = await fetchPage(1)
  const totalPages = Math.ceil(first.totalCount / PAGE_SIZE)

  const matched: SportsFacilityItem[] = first.items.filter(it =>
    addressKeywords.some(kw => it.address.includes(kw))
  )

  onProgress?.(1, totalPages)

  for (let page = 2; page <= totalPages; page++) {
    const { items } = await fetchPage(page)
    const filtered = items.filter(it =>
      addressKeywords.some(kw => it.address.includes(kw))
    )
    matched.push(...filtered)
    onProgress?.(page, totalPages)
    // API 과부하 방지
    await new Promise(r => setTimeout(r, 100))
  }

  return matched
}
