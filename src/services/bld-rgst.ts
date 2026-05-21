/**
 * 국토부 건축물대장 API 어댑터
 * Base URL: https://apis.data.go.kr/1613000/BldRgstHubService
 * 엔드포인트: getBrTitleInfo (표제부 조회)
 * 환경변수: BLD_RGST_API_KEY
 */
import { z } from 'zod/v4'
import { withRetry } from '@/lib/api/retry'

const BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo'

export const BldTitleItemSchema = z.object({
  bldNm:           z.string().optional(),              // 건물명
  hhldCnt:         z.coerce.number().int().optional(), // 세대수
  grndFlrCnt:      z.coerce.number().int().optional(), // 지상층수
  ugrndFlrCnt:     z.coerce.number().int().optional(), // 지하층수
  rideUseElvtCnt:  z.coerce.number().int().optional(), // 승용 승강기수
  emgenUseElvtCnt: z.coerce.number().int().optional(), // 비상용 승강기수
  totPkngCnt:      z.coerce.number().int().optional(), // 총 주차수
  totArea:         z.coerce.number().optional(),        // 연면적 (㎡)
  mainPurpsCdNm:   z.string().optional(),               // 주요용도명 (오피스텔 등)
  useAprDay:       z.string().optional(),               // 사용승인일 YYYYMMDD
  newPlatPlc:      z.string().optional(),               // 도로명주소
  platPlc:         z.string().optional(),               // 지번주소
})

export type BldTitleItem = z.infer<typeof BldTitleItemSchema>

export interface BldFetchParams {
  sigunguCd: string   // 5자리 시군구코드 (ex: '48121')
  bjdongCd:  string   // 4자리 법정동코드 (ex: '1040')
  platGbCd?: string   // 대지구분 (0: 대지, 1: 산, 2: 블록 — 기본 '0')
  bun:       string   // 본번 4자리 0-padded (ex: '0158')
  ji:        string   // 부번 4자리 0-padded (ex: '0010')
}

function normalizeItems(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') return []
  const item = (raw as Record<string, unknown>).item
  if (!item) return []
  return Array.isArray(item) ? item : [item]
}

export async function fetchBldTitleInfo(params: BldFetchParams): Promise<BldTitleItem[]> {
  const apiKey = process.env.BLD_RGST_API_KEY
  if (!apiKey) throw new Error('BLD_RGST_API_KEY is not set')

  const url = new URL(BASE)
  url.searchParams.set('ServiceKey', apiKey)
  url.searchParams.set('sigunguCd', params.sigunguCd)
  url.searchParams.set('bjdongCd', params.bjdongCd)
  url.searchParams.set('platGbCd', params.platGbCd ?? '0')
  url.searchParams.set('bun', params.bun)
  url.searchParams.set('ji', params.ji)
  url.searchParams.set('numOfRows', '10')
  url.searchParams.set('pageNo', '1')
  url.searchParams.set('_type', 'json')

  return withRetry(async () => {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw Object.assign(new Error(`BldRgst API ${res.status}`), { status: res.status })

    const json: unknown = await res.json()

    // 오류 응답 (resultCode != 00) 체크
    const header = (json as { response?: { header?: { resultCode?: string; resultMsg?: string } } })?.response?.header
    if (header?.resultCode && header.resultCode !== '00') {
      throw new Error(`BldRgst API 오류: ${header.resultMsg ?? header.resultCode}`)
    }

    const body = (json as { response?: { body?: unknown } })?.response?.body
    const rawItems = normalizeItems((body as { items?: unknown } | undefined)?.items)

    return rawItems
      .map(raw => BldTitleItemSchema.safeParse(raw))
      .filter((r): r is { success: true; data: BldTitleItem } => r.success)
      .map(r => r.data)
  })
}
