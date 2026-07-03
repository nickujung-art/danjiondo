// server-only 미포함 — scripts/(seed-complexes.ts, kapt-enrich.ts 등 6개)에서 tsx로 직접 임포트해야 함
// (naver-land.ts/presale-crawler.ts와 동일 패턴). 'server-only' 마커는 Node 스크립트 실행 시
// exports 조건이 맞지 않아 무조건 throw하여 백필 스크립트를 깨뜨림. 클라이언트 컴포넌트에서
// import된 적 없음(grep 검증: API route + scripts만 사용) — 노출 리스크 없음.
import { z } from 'zod/v4'

// 국토교통부_공동주택 단지 목록제공 서비스 (data.go.kr 승인 API)
// 오퍼레이션: getSigunguAptList3 — 시군구코드로 단지 코드+단지명 조회
// 파라미터명: sigunguCode (sigunguCd 아님)
const BASE_URL = 'https://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3'

const KaptComplexSchema = z.object({
  kaptCode: z.string(),
  kaptName: z.string(),
  bjdCode:  z.string().optional(),   // 10자리 법정동코드
  as1:      z.string().optional(),   // 시도
  as2:      z.string().optional(),   // 시군구
  as3:      z.string().optional(),   // 읍면동
  as4:      z.string().nullable().optional(),
})

export type KaptComplex = z.infer<typeof KaptComplexSchema>

export async function fetchComplexList(sggCode: string): Promise<KaptComplex[]> {
  const apiKey = process.env.KAPT_API_KEY
  if (!apiKey) throw new Error('KAPT_API_KEY is not set')

  const results: KaptComplex[] = []
  let pageNo = 1
  const numOfRows = 100

  while (true) {
    const url = new URL(BASE_URL)
    url.searchParams.set('ServiceKey', apiKey)
    url.searchParams.set('sigunguCode', sggCode)
    url.searchParams.set('pageNo', String(pageNo))
    url.searchParams.set('numOfRows', String(numOfRows))
    url.searchParams.set('_type', 'json')

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`K-apt API error: HTTP ${res.status}`)

    const json: unknown = await res.json()
    const body = (json as { response?: { body?: unknown } })?.response?.body
    const rawItems = (body as { items?: unknown })?.items
    const items: unknown[] = Array.isArray(rawItems) ? rawItems : []

    if (items.length === 0) break

    for (const item of items) {
      const parsed = KaptComplexSchema.safeParse(item)
      if (parsed.success) results.push(parsed.data)
    }

    const totalCount: number = (body as { totalCount?: number })?.totalCount ?? 0
    if (results.length >= totalCount || items.length < numOfRows) break
    pageNo++
  }

  return results
}

// ===== fetchKaptBasicInfo (DATA-01) =====
// V4 엔드포인트 (data.go.kr 국토교통부_공동주택 기본 정보제공 서비스 승인 필요). 500 시 V1으로 fallback.
const BASIC_INFO_URL_V4 = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4'
const BASIC_INFO_URL_V1 = 'https://apis.data.go.kr/1613000/AptBasisInfoService/getAphusBassInfo'

export const kaptBasicInfoSchema = z.object({
  kaptCode:       z.string(),
  kaptName:       z.string(),
  kaptdaCnt:      z.coerce.number().optional(),   // 세대수
  kaptDongCnt:    z.coerce.number().optional(),   // 동수
  heatType:       z.string().optional(),          // 난방방식 (V1 필드명)
  managementType: z.string().optional(),          // 관리방식
  totalArea:      z.coerce.number().optional(),   // 연면적
  kaptUsedate:    z.string().optional(),          // 사용승인일 YYYYMMDD (준공연도 원천)
  doroJuso:       z.string().optional(),          // 도로명주소
  codeHeatNm:     z.string().optional(),          // 난방방식 명칭 (heatType 폴백용)
  kaptAddr:       z.string().optional(),          // 법정동주소
})

/** @deprecated KaptBasicInfoSchema → kaptBasicInfoSchema 로 변경됨. 내부용으로 유지. */
const KaptBasicInfoSchema = kaptBasicInfoSchema

export type KaptBasicInfo = z.infer<typeof kaptBasicInfoSchema>

async function fetchKaptBasicInfoFromUrl(
  baseUrl: string,
  kaptCode: string,
  apiKey: string,
): Promise<KaptBasicInfo | null> {
  const url = new URL(baseUrl)
  url.searchParams.set('ServiceKey', apiKey)
  url.searchParams.set('kaptCode', kaptCode)
  url.searchParams.set('_type', 'json')

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`K-apt BasicInfo API ${res.status}`)

  const json: unknown = await res.json()
  const item = (json as { response?: { body?: { item?: unknown } } })?.response?.body?.item
  const parsed = KaptBasicInfoSchema.safeParse(item)
  return parsed.success ? parsed.data : null
}

export async function fetchKaptBasicInfo(kaptCode: string): Promise<KaptBasicInfo | null> {
  const apiKey = process.env.KAPT_API_KEY
  if (!apiKey) throw new Error('KAPT_API_KEY is not set')

  // V4 먼저 시도, 500이면 V1으로 fallback
  try {
    return await fetchKaptBasicInfoFromUrl(BASIC_INFO_URL_V4, kaptCode, apiKey)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('500')) throw err
    return await fetchKaptBasicInfoFromUrl(BASIC_INFO_URL_V1, kaptCode, apiKey)
  }
}

// ===== fetchKaptDetailInfo =====
// V4 상세 정보조회 — 주차·엘리베이터·관리비 등
// 필드명이 API 버전마다 다를 수 있으므로 optional로 넓게 수신 후 scripts에서 매핑
const DETAIL_INFO_URL_V4 = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusDtlInfoV4'

export const kaptDetailInfoSchema = z.object({
  kaptCode:    z.string(),
  kaptName:    z.string(),
  kaptdEcnt:   z.coerce.number().optional(),   // 엘리베이터 수
  kaptdPcntu:  z.coerce.number().optional(),   // 지하 주차면수
  kaptdPcnt:   z.coerce.number().optional(),   // 지상 주차면수
  kaptdCccnt:  z.coerce.number().optional(),   // CCTV 수
  codeMgr:     z.string().optional(),          // 관리방식
  welfareFacility: z.string().nullable().optional(), // 복리시설
  // 관리비(managCost)는 이 엔드포인트에 없음 — 별도 월별 관리비 API 필요
})

export type KaptDetailInfo = z.infer<typeof kaptDetailInfoSchema>

export async function fetchKaptDetailInfo(kaptCode: string): Promise<{ parsed: KaptDetailInfo | null; raw: unknown }> {
  const apiKey = process.env.KAPT_API_KEY
  if (!apiKey) throw new Error('KAPT_API_KEY is not set')

  const url = new URL(DETAIL_INFO_URL_V4)
  url.searchParams.set('ServiceKey', apiKey)
  url.searchParams.set('kaptCode', kaptCode)
  url.searchParams.set('_type', 'json')

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`K-apt DetailInfo API ${res.status}`)

  const json: unknown = await res.json()
  const item = (json as { response?: { body?: { item?: unknown } } })?.response?.body?.item
  const parsed = kaptDetailInfoSchema.safeParse(item)
  return { parsed: parsed.success ? parsed.data : null, raw: item }
}
