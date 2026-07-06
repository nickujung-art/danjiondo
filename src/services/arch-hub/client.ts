/**
 * 건축HUB 건축인허가정보 서비스 어댑터
 * https://apis.data.go.kr/1613000/ArchPmsHubService/getApBasisOulnInfo
 * 환경변수: MOLIT_API_KEY (data.go.kr 동일 키)
 *
 * 용도: 분양 예정 단지를 건축인허가 DB에서 매칭하여 세대수/허가일/주소 자동 보완
 */
import { z } from 'zod/v4'
import { withRetry } from '@/lib/api/retry'

const BASE_URL = 'https://apis.data.go.kr/1613000/ArchPmsHubService/getApBasisOulnInfo'

export const ArchHubItemSchema = z.object({
  mgmPmsrgstPk:  z.string().optional(),   // 인허가 PK
  bldNm:         z.string().optional(),   // 건물명
  platPlcNm:     z.string().optional(),   // 대지위치(지번주소)
  newPlatPlcNm:  z.string().optional(),   // 도로명주소
  sigunguCd:     z.string().optional(),   // 시군구코드
  bjdongCd:      z.string().optional(),   // 법정동코드
  archArea:      z.coerce.number().optional(),  // 건축면적(㎡)
  totArea:       z.coerce.number().optional(),  // 연면적(㎡)
  hhldCnt:       z.coerce.number().optional(),  // 세대수
  pmsDay:        z.string().optional(),   // 허가일 (YYYYMMDD)
  stcnsDay:      z.string().optional(),   // 착공일
  useAprDay:     z.string().optional(),   // 사용승인일
  mainPurpsCdNm: z.string().optional(),   // 주용도명 (아파트)
})

export type ArchHubItem = z.infer<typeof ArchHubItemSchema>

/**
 * 건물명으로 건축인허가 검색
 * 403(미승인) 또는 네트워크 오류 시 빈 배열 반환 (graceful degradation)
 */
export async function searchArchHub(
  bldNm: string,
  sigunguCd?: string,
): Promise<ArchHubItem[]> {
  const apiKey = process.env.MOLIT_API_KEY
  if (!apiKey) return []

  try {
    const url = new URL(BASE_URL)
    url.searchParams.set('serviceKey', apiKey)
    url.searchParams.set('bldNm', bldNm)
    url.searchParams.set('numOfRows', '10')
    url.searchParams.set('pageNo', '1')
    url.searchParams.set('_type', 'json')
    if (sigunguCd) url.searchParams.set('sigunguCd', sigunguCd)

    return await withRetry(async () => {
      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10_000),
      })
      // 403 = 미승인 → graceful skip
      if (res.status === 403) return []
      if (!res.ok) throw new Error(`ArchHub API ${res.status}`)
      const json: unknown = await res.json()
      const items = (json as { response?: { body?: { items?: { item?: unknown[] | unknown } } } })
        ?.response?.body?.items?.item
      const arr = Array.isArray(items) ? items : items ? [items] : []
      return arr
        .map(raw => ArchHubItemSchema.safeParse(raw))
        .filter(r => r.success)
        .map(r => (r as { success: true; data: ArchHubItem }).data)
        .filter(i => i.mainPurpsCdNm?.includes('아파트'))
    })
  } catch {
    return []
  }
}

/**
 * 단지명으로 최적 매칭 항목 반환 (세대수 가장 많은 것 우선)
 */
export async function matchArchHub(name: string, sigunguCd?: string): Promise<ArchHubItem | null> {
  // 지역명 제거 후 핵심 단지명만 추출 (예: "창원 한신더휴 메가센텀" → "한신더휴 메가센텀")
  const coreName = name.replace(
    /^(창원|김해|마산|진해|진주|통영|사천|밀양|거제|양산|의령|함안|창녕|고성|남해|하동|산청|함양|거창|합천)\s+/,
    '',
  ).trim()
  const results = await searchArchHub(coreName, sigunguCd)
  if (results.length === 0) return null
  // 세대수 내림차순 정렬 후 최적 매칭
  return results.sort((a, b) => (b.hhldCnt ?? 0) - (a.hhldCnt ?? 0))[0] ?? null
}
