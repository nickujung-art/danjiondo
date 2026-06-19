import 'server-only'

/**
 * SGIS 통계지리정보서비스 API 어댑터 (얇은 래퍼 — 비즈니스 로직 없음)
 * 패턴: src/services/molit.ts 준수 (Zod 스키마 → fetch + AbortSignal.timeout → parse → typed return)
 *
 * SGIS_CONSUMER_KEY, SGIS_CONSUMER_SECRET 환경변수 필요 (서버 사이드 전용 — T-06-01-04)
 */
import { z } from 'zod/v4'

const BASE = 'https://sgisapi.kostat.go.kr/OpenAPI3'

// ── 인증 토큰 ─────────────────────────────────────────────────

const TokenResponseSchema = z.object({
  result: z.object({
    accessToken: z.string(),
    accessTimeout: z.number(),
  }),
  errMsg: z.string(),
  errCd: z.number(),
})

/**
 * SGIS 액세스 토큰 발급
 * 각 API 호출 전 토큰을 획득해야 함.
 */
export async function fetchSgisToken(): Promise<string> {
  const key = process.env.SGIS_CONSUMER_KEY
  const secret = process.env.SGIS_CONSUMER_SECRET
  if (!key || !secret) throw new Error('SGIS credentials not set')

  const url = new URL(`${BASE}/auth/authentication.json`)
  url.searchParams.set('consumer_key', key)
  url.searchParams.set('consumer_secret', secret)

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`SGIS auth HTTP ${res.status}`)

  const json = TokenResponseSchema.parse(await res.json())
  if (json.errCd !== 0) throw new Error(`SGIS auth error: ${json.errMsg}`)
  return json.result.accessToken
}

// ── 인구 통계 ─────────────────────────────────────────────────

const PopulationItemSchema = z.object({
  adm_cd: z.string(),
  adm_nm: z.string(),
  population: z.coerce.number(),
})

export interface SgisPopulationResult {
  population: number
  adm_nm: string
}

/**
 * 시군구 인구 조회
 * @param accessToken fetchSgisToken()으로 발급한 토큰
 * @param adm_cd 행정구역 코드 (5자리, 예: '48121' 창원 의창구)
 * @param year 기준 연도 (예: 2023)
 */
export async function fetchPopulation(
  accessToken: string,
  adm_cd: string,
  year: number,
): Promise<SgisPopulationResult> {
  const url = new URL(`${BASE}/stats/searchpopulation.json`)
  url.searchParams.set('accessToken', accessToken)
  url.searchParams.set('year', String(year))
  url.searchParams.set('adm_cd', adm_cd)

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`SGIS population HTTP ${res.status}`)

  const json = (await res.json()) as { result?: unknown[]; errMsg?: string; errCd?: number }
  if ((json.errCd ?? -1) !== 0) throw new Error(`SGIS population error: ${json.errMsg}`)

  const item = PopulationItemSchema.parse((json.result ?? [])[0])
  return { population: item.population, adm_nm: item.adm_nm }
}

// ── 세대 통계 ─────────────────────────────────────────────────

const HouseholdItemSchema = z.object({
  adm_cd: z.string(),
  adm_nm: z.string(),
  household_cnt: z.coerce.number(),
})

export interface SgisHouseholdResult {
  households: number
}

/**
 * 시군구 세대 수 조회
 * @param accessToken fetchSgisToken()으로 발급한 토큰
 * @param adm_cd 행정구역 코드
 * @param year 기준 연도
 */
export async function fetchHouseholds(
  accessToken: string,
  adm_cd: string,
  year: number,
): Promise<SgisHouseholdResult> {
  const url = new URL(`${BASE}/stats/household.json`)
  url.searchParams.set('accessToken', accessToken)
  url.searchParams.set('year', String(year))
  url.searchParams.set('adm_cd', adm_cd)

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`SGIS household HTTP ${res.status}`)

  const json = (await res.json()) as { result?: unknown[]; errMsg?: string; errCd?: number }
  if ((json.errCd ?? -1) !== 0) throw new Error(`SGIS household error: ${json.errMsg}`)

  const item = HouseholdItemSchema.parse((json.result ?? [])[0])
  return { households: item.household_cnt }
}

// ── 창원·김해 시군구 ADM_CD 상수 ────────────────────────────────
// 검증 방법: GET ${BASE}/addr/stage.json?accessToken=...&cd=48&pg_yn=1
// 상태: ASSUMED — 실제 SGIS stage API 응답으로 검증 필요 (Wave 2 분기 적재 시 확인)

export const CHANGWON_GU_CODES: Record<string, string> = {
  의창구: '48121',
  성산구: '48123',
  마산합포구: '48125',
  마산회원구: '48127',
  진해구: '48129',
}

export const GIMHAE_CODE = '48250'
