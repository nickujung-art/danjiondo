/**
 * 경상남도 미분양현황 API 어댑터
 * End Point: https://apis.data.go.kr/6480000/gyeongnamunsold/gyeongnamunsoldlist
 * 인증키: MOLIT_API_KEY (data.go.kr 공용)
 */
import { z } from 'zod/v4'

const BASE = 'https://apis.data.go.kr/6480000/gyeongnamunsold/gyeongnamunsoldlist'

const UnsoldItemSchema = z.object({
  signgunm:      z.string(),           // 시군구명 (예: "창원시")
  dongnm:        z.string(),           // 동명
  rdnmadr:       z.string(),           // 도로명주소 (구 정보 포함)
  construction:  z.string(),           // 건설사
  enforcer:      z.string(),           // 시행사
  publictypenm:  z.string(),           // 민간/공공
  leasetypenm:   z.string(),           // 분양/임대
  privatear:     z.preprocess(v => { const n = Number(v); return (v === '' || v == null || isNaN(n)) ? null : n }, z.number().nullable()),
  totalcnt:      z.coerce.number().int(),
  unsoldcnt_prev: z.coerce.number().int().default(0),
  unsoldcnt_this: z.coerce.number().int().default(0),
  approvaldt:    z.string().optional(),
  deadlinedt:    z.string().optional(),
  planinmonth:   z.string().optional(),
  completetypenm: z.string().optional(),
  latitude:      z.string().optional(),
  longitude:     z.string().optional(),
})

export type UnsoldItem = z.infer<typeof UnsoldItemSchema>

const ResponseSchema = z.object({
  gyeongnamunsoldlist: z.object({
    header: z.object({ resultCode: z.string(), resultMsg: z.string() }),
    body: z.object({
      items: z.object({ item: z.array(UnsoldItemSchema) }),
      numOfRows: z.number(),
      pageNo: z.number(),
      totalCount: z.number(),
    }),
  }),
})

export async function fetchGyeongnamUnsold(pageNo = 1, numOfRows = 1000): Promise<{
  items: UnsoldItem[]
  totalCount: number
}> {
  const key = process.env.MOLIT_API_KEY
  if (!key) throw new Error('MOLIT_API_KEY not set')

  const url = new URL(BASE)
  url.searchParams.set('ServiceKey', key)
  url.searchParams.set('pageNo', String(pageNo))
  url.searchParams.set('numOfRows', String(numOfRows))
  url.searchParams.set('resultType', 'json')

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`gyeongnamunsold HTTP ${res.status}`)

  const json = ResponseSchema.parse(await res.json())
  const body = json.gyeongnamunsoldlist.body

  if (json.gyeongnamunsoldlist.header.resultCode !== '00') {
    throw new Error(`API error: ${json.gyeongnamunsoldlist.header.resultMsg}`)
  }

  return { items: body.items.item, totalCount: body.totalCount }
}

// ── 시군구명 → sgg_code 매핑 ────────────────────────────────────
// 창원시는 rdnmadr에서 구 이름 추출 필요

const CHANGWON_GU_MAP: Record<string, string> = {
  '의창구': '48121',
  '성산구': '48123',
  '마산합포구': '48125',
  '마산회원구': '48127',
  '진해구': '48129',
}

export function resolveSggCode(item: UnsoldItem): string | null {
  const sgg = item.signgunm
  if (sgg.includes('김해')) return '48250'
  if (sgg.includes('창원')) {
    for (const [guName, code] of Object.entries(CHANGWON_GU_MAP)) {
      if (item.rdnmadr.includes(guName)) return code
    }
    return null // 창원시이지만 구 파악 불가
  }
  return null // 서비스 범위 외 (진주시, 통영시 등)
}
