/**
 * 행정안전부_생활_체육도장업 조회서비스 어댑터
 * 출처: data.go.kr → 활용신청 후 발급받은 키
 * 환경변수: LOCALDATA_SPORTS_API_KEY (data.go.kr 체육도장업 서비스 키)
 *
 * TODO: 키 발급 승인 후 마이페이지 → API 목록에서 실제 엔드포인트 URL 확인 후 BASE에 입력
 */
import { z } from 'zod/v4'

// TODO: 승인 후 data.go.kr 마이페이지 → 활용신청 목록 → 해당 서비스의 EndPoint URL로 교체
const BASE = 'https://apis.data.go.kr/B551011/gymStdgInfoService2/getGymStdgInfo2'

// ─── 응답 스키마 ───────────────────────────────────────────────────────────────

const ItemSchema = z.object({
  bizNm:       z.string(),                        // 사업장명
  uptaeNm:     z.string().default(''),            // 업태명 (태권도, 검도, 유도 등)
  rdnWhlAddr:  z.string().default(''),            // 도로명전체주소
  x:           z.string().optional().nullable(),  // 경도 (없을 수 있음)
  y:           z.string().optional().nullable(),  // 위도 (없을 수 있음)
  trdStateGbn: z.string().default(''),            // 영업상태 (01=영업중)
  sigunNm:     z.string().optional().nullable(),  // 시군구명
})

const ResponseSchema = z.object({
  response: z.object({
    header: z.object({ resultCode: z.string(), resultMsg: z.string() }),
    body: z.object({
      totalCount: z.coerce.number(),
      numOfRows:  z.coerce.number(),
      pageNo:     z.coerce.number(),
      items: z.union([
        z.object({ item: z.union([z.array(ItemSchema), ItemSchema]) }),
        z.string(),  // 결과 없을 때 빈 문자열로 오는 경우
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
  sigunCode: string,
  pageNo: number,
  numOfRows: number,
): Promise<{ items: SportsFacilityItem[]; totalCount: number }> {
  const key = process.env.LOCALDATA_SPORTS_API_KEY
  if (!key) throw new Error('LOCALDATA_SPORTS_API_KEY not set')

  const url = new URL(BASE)
  url.searchParams.set('serviceKey',  key)
  url.searchParams.set('pageNo',      String(pageNo))
  url.searchParams.set('numOfRows',   String(numOfRows))
  url.searchParams.set('resultType',  'json')
  url.searchParams.set('sigunCode',   sigunCode)
  url.searchParams.set('trdStateGbn', '01')  // 영업중만

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`localdata-sports HTTP ${res.status}`)

  const parsed = ResponseSchema.parse(await res.json())
  const { body } = parsed.response

  if (!body.items || typeof body.items === 'string') {
    return { items: [], totalCount: 0 }
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
  sigunCode: string,
): Promise<SportsFacilityItem[]> {
  const PAGE_SIZE = 1000
  const first = await fetchPage(sigunCode, 1, PAGE_SIZE)
  const allItems = [...first.items]

  const totalPages = Math.ceil(first.totalCount / PAGE_SIZE)
  for (let page = 2; page <= totalPages; page++) {
    const { items } = await fetchPage(sigunCode, page, PAGE_SIZE)
    allItems.push(...items)
  }

  return allItems
}
