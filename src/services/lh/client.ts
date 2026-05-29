/**
 * LH 공급정보 API 어댑터
 * 목록: GET /B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1
 * 상세: GET /B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1
 * 환경변수: LH_API_KEY (data.go.kr B552555 전용, MOLIT_API_KEY와 별도)
 *
 * 신청: https://www.data.go.kr/data/15058476/openapi.do
 */
import { withRetry } from '@/lib/api/retry'
import { LhNoticeItemSchema, LhDetailSubdSchema, type LhNoticeItem, type LhDetailSubd } from './types'

const BASE_URL = 'https://apis.data.go.kr/B552555'

/** 창원·김해 지역명 필터 */
const TARGET_REGIONS = ['창원', '김해', '경남', '경상남도']

function parseLhDate(val: string | undefined): string | null {
  if (!val) return null
  const s = val.replace(/\./g, '-').replace(/\s/g, '')
  return s.length >= 10 ? s.slice(0, 10) : null
}

/**
 * LH 공고 목록 조회 (공고중 + 접수중)
 * LH_API_KEY 없으면 빈 배열 반환 (graceful degradation)
 */
export async function fetchLhList(): Promise<LhNoticeItem[]> {
  const apiKey = process.env.LH_API_KEY
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log('  ⚠ LH_API_KEY 미설정 — LH 데이터 스킵 (data.go.kr B552555 키 신청 필요)')
    return []
  }

  const allItems: LhNoticeItem[] = []

  for (const status of ['공고중', '접수중'] as const) {
    try {
      const url = new URL(`${BASE_URL}/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1`)
      url.searchParams.set('serviceKey', apiKey)
      url.searchParams.set('PG_SZ', '1000')
      url.searchParams.set('PAGE', '1')
      url.searchParams.set('PAN_SS', status)

      const items = await withRetry(async () => {
        const res = await fetch(url.toString(), {
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) throw new Error(`LH API ${res.status}`)
        const json: unknown = await res.json()
        const arr = (json as { 1?: { dsList?: unknown[] } })?.[1]?.dsList ?? []
        return arr
          .map(raw => LhNoticeItemSchema.safeParse(raw))
          .filter(r => r.success)
          .map(r => (r as { success: true; data: LhNoticeItem }).data)
      })

      allItems.push(...items)
    } catch (err) {
      console.warn(`  ⚠ LH ${status} 조회 실패: ${String(err)}`)
    }
  }

  return allItems.filter(item =>
    TARGET_REGIONS.some(r => item.CNP_CD_NM?.includes(r)),
  )
}

/**
 * 공고 상세 조회 — 세대수, 입주예정월, 단지명
 */
export async function fetchLhDetail(
  item: LhNoticeItem,
): Promise<LhDetailSubd | null> {
  const apiKey = process.env.LH_API_KEY
  if (!apiKey) return null

  try {
    const url = new URL(`${BASE_URL}/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1`)
    url.searchParams.set('serviceKey', apiKey)
    if (item.SPL_INF_TP_CD) url.searchParams.set('SPL_INF_TP_CD', item.SPL_INF_TP_CD)
    if (item.CCR_CNNT_SYS_DS_CD) url.searchParams.set('CCR_CNNT_SYS_DS_CD', item.CCR_CNNT_SYS_DS_CD)
    url.searchParams.set('PAN_ID', item.PAN_ID)

    return await withRetry(async () => {
      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return null
      const json: unknown = await res.json()
      const subdArr = (json as { dsSbd?: unknown[] })?.dsSbd ?? []
      if (subdArr.length === 0) return null
      const parsed = LhDetailSubdSchema.safeParse(subdArr[0])
      return parsed.success ? parsed.data : null
    })
  } catch {
    return null
  }
}

export { parseLhDate }
