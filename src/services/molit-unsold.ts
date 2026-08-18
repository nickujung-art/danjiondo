/**
 * 경상남도 미분양현황 API 어댑터
 * End Point: https://apis.data.go.kr/6480000/gyeongnamunsold/gyeongnamunsoldlist
 * 인증키: MOLIT_API_KEY (data.go.kr 공용)
 */
import { z } from 'zod/v4'
import { withRetry } from '@/lib/api/retry'

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

  // 재시도를 붙인 이유: 이 배치는 **월 1회(매월 1일)** 크론이라 한 번 실패하면 다음 기회가
  // 한 달 뒤다. 2026-08-01 실행이 일시적인 HTTP 502 하나로 통째로 날아갔고, 그 시점에는
  // 재시도가 없어 그대로 끝났다(2026-08-04 전수조사에서 발견).
  // 5xx 는 상대 서버가 잠깐 흔들린 것이라 재시도가 실효가 있다.
  return withRetry(async () => {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      throw Object.assign(new Error(`gyeongnamunsold HTTP ${res.status}`), { status: res.status })
    }

    /*
      본문을 먼저 텍스트로 읽는다 — `res.json()` 을 바로 부르면 안 된다.

      이 API 는 `resultType=json` 을 줘도 **오류일 때는 XML 로 답한다.** 그러면
      `res.json()` 이 `SyntaxError: Unexpected token '<'` 로 터지고 서버가 알려준
      이유는 통째로 사라진다. 2026-08-18 에 실제로 그랬다 — 로그엔 JSON 파싱 실패만
      남아서, API 를 손으로 때려보고서야
      `<resultCode>99</resultCode><resultMsg>UNKNOWN_ERROR</resultMsg>` 를 알았다.
      HTTP 는 200 이라 위의 `res.ok` 검사도 통과한다.

      withRetry 로 감싸도 소용없다 — 지속 오류라 세 번 다 같은 XML 이 온다.
      목적은 복구가 아니라 **재시도가 무의미한 실패를 그렇게 읽히게** 만드는 것이다.
    */
    const raw = await res.text()
    if (!raw.trimStart().startsWith('{')) {
      const code = raw.match(/<resultCode>([^<]*)<\/resultCode>/)?.[1] ?? '?'
      const msg = raw.match(/<resultMsg>([^<]*)<\/resultMsg>/)?.[1] ?? raw.slice(0, 200)
      throw new Error(`gyeongnamunsold 비-JSON 응답 (resultCode=${code}): ${msg}`)
    }

    const json = ResponseSchema.parse(JSON.parse(raw))
    const body = json.gyeongnamunsoldlist.body

    if (json.gyeongnamunsoldlist.header.resultCode !== '00') {
      throw new Error(`API error: ${json.gyeongnamunsoldlist.header.resultMsg}`)
    }

    return { items: body.items.item, totalCount: body.totalCount }
  })
}

// ── 시군구명 → sgg_code 매핑 (regions 테이블 기반 동적 역매칭) ──────
// CHANGWON_GU_MAP 등 정적 배열 대신 활성 regions 행(si/gu)을 역매칭한다.
// signgunm으로 si 후보를 좁히고, 창원처럼 si가 같은 복수 gu 후보가 있으면
// rdnmadr에서 gu 이름을 찾아 단일 코드로 좁힌다.

export interface RegionAddrEntry {
  sgg_code: string
  si: string
  gu: string | null
}

export function resolveSggCode(item: UnsoldItem, regions: RegionAddrEntry[]): string | null {
  const candidates = regions.filter(r => item.signgunm.includes(r.si))
  if (candidates.length === 0) return null // regions 테이블에 없는 시군구 (서비스 범위 외)
  if (candidates.length === 1) return candidates[0]?.sgg_code ?? null
  const guMatch = candidates.find(r => r.gu != null && item.rdnmadr.includes(r.gu))
  return guMatch?.sgg_code ?? null // si는 같으나 구(rdnmadr) 파악 불가
}
