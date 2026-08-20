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

/**
 * ⚠️ optional 문자열은 반드시 `.nullish()` 다 — `.optional()` 은 `undefined` 만 받고
 * **`null` 은 거부한다.** K-apt 는 값이 없는 필드를 `null` 로 보낸다(도로명주소 없는
 * 신축·임대주택 등). 그래서 `doroJuso: null` 하나 때문에 단지 전체가 파싱 실패하고,
 * 호출부에는 그냥 `null` 이 돌아가 "데이터 없는 단지" 로 취급됐다.
 *
 * 2026-08-20 에 이걸로 17개 단지가 계속 스킵되고 있었고, 워크플로는 영구히 빨간색이었다.
 * 실제 응답으로 확인한 문구:
 *   schema_mismatch: doroJuso: Invalid input: expected string, received null
 *
 * ⚠️ 숫자 필드(`z.coerce.number()`)는 반대로 **`null` 을 조용히 `0` 으로 바꾼다.**
 * 파싱은 통과하지만 값이 틀린다 — 별개 문제로 남겨둔다(2026-08-20 확인).
 */
export const kaptBasicInfoSchema = z.object({
  kaptCode:       z.string(),
  kaptName:       z.string(),
  kaptdaCnt:      z.coerce.number().optional(),   // 세대수
  kaptDongCnt:    z.coerce.number().optional(),   // 동수
  heatType:       z.string().nullish(),          // 난방방식 (V1 필드명)
  managementType: z.string().nullish(),          // 관리방식
  totalArea:      z.coerce.number().optional(),   // 연면적 (V1 필드명)
  // V4 는 같은 값을 kaptTarea 로 준다. totalArea 만 읽고 있어서 facility_kapt.total_area 가
  // 한 번도 채워진 적이 없었다(전 행 NULL, 2026-08-05 확인).
  kaptTarea:      z.coerce.number().optional(),   // 연면적 (V4 필드명)
  kaptUsedate:    z.string().nullish(),          // 사용승인일 YYYYMMDD (준공연도 원천)
  doroJuso:       z.string().nullish(),          // 도로명주소
  codeHeatNm:     z.string().nullish(),          // 난방방식 명칭 (heatType 폴백용)
  kaptAddr:       z.string().nullish(),          // 법정동주소
  // ── 관리비 평형별 배분용(2026-08-05) ───────────────────────────────────
  // 공동주택 관리비는 법령상 **관리비부과면적 비례**로 부과된다. kaptMarea 가 있어야
  // 단지 총액(management_cost_monthly)을 평형별 금액으로 쪼갤 수 있다. 없으면 세대당
  // 균등 배분밖에 못 해서 59㎡와 114㎡가 같은 금액으로 나온다.
  // V1 폴백 응답에는 없을 수 있어 전부 optional 이다.
  kaptMarea:      z.coerce.number().optional(),   // 관리비부과면적(㎡, 공급면적 합계)
  // privArea / kaptMarea = 전용률. 이게 있어야 **거래 데이터의 전용면적**을 공급면적으로
  // 환산할 수 있다. complex_area_types(공급면적 보유)는 관리비 있는 단지의 32%뿐이라
  // 그것만으로는 대부분의 단지에서 평형별 관리비를 못 낸다.
  privArea:       z.coerce.number().optional(),   // 전용면적 합계(㎡)
  kaptMparea60:   z.coerce.number().optional(),   // 전용 60㎡ 이하 세대수
  kaptMparea85:   z.coerce.number().optional(),   // 60~85㎡
  kaptMparea135:  z.coerce.number().optional(),   // 85~135㎡
  kaptMparea136:  z.coerce.number().optional(),   // 135㎡ 초과
})

export type KaptBasicInfo = z.infer<typeof kaptBasicInfoSchema>

/**
 * `fetchKaptBasicInfo` 가 값을 못 얻은 **이유**.
 *
 * [왜 필요한가 — 2026-08-20]
 * 예전에는 서로 다른 상황이 전부 `null` 하나로 뭉개졌다. 그래서 `kapt-enrich` 로그에는
 * "fetchKaptBasicInfo null 반환 (스킵)" 만 남고 **원인을 알 방법이 없었다.**
 * 그 상태에서 판단을 세 번 틀렸다:
 *   ① "kapt_code 가 없어서다" — 아니었다. 그 스크립트는 애초에 kapt_code 있는 것만 본다
 *   ② "API 타임아웃이라 시간을 두면 된다" — 타임아웃은 풀렸는데도 계속 실패했다
 *   ③ "데이터가 없는 단지다" — **아니었다.** 실패했다는 코드를 직접 호출하니
 *      HTTP 200 · resultCode 00 · item 정상 · 스키마 위반 0 이었다
 *
 * ③ 을 믿고 "null = 대상 아님" 으로 처리했다면 **멀쩡한 단지를 영구히 건너뛰었을 것이다.**
 * 그래서 이유를 분류해 돌려준다 — 셋은 대응이 완전히 다르다.
 */
export type KaptBasicInfoFailure =
  /** data.go.kr 이 HTTP 200 에 실어 보내는 **에러 봉투**(쿼터 초과·키 오류 등).
   *  `response.body.item` 이 없어 예전에는 "데이터 없음" 과 구분되지 않았다.
   *  **재시도로 풀리는 종류이므로 조용히 넘기면 안 된다.** */
  | { reason: 'error_envelope'; hint: string }
  /** API 는 정상 응답인데 그 코드에 해당하는 항목이 없다. 진짜 "대상 아님" 후보. */
  | { reason: 'no_item'; hint: string }
  /** 항목은 있는데 우리 스키마와 안 맞는다. **응답 구조가 바뀐 것**이라 시끄럽게 실패해야 한다. */
  | { reason: 'schema_mismatch'; hint: string }

export type KaptBasicInfoOutcome =
  | { ok: true; data: KaptBasicInfo }
  | ({ ok: false } & KaptBasicInfoFailure)

/** data.go.kr 공통 에러 봉투인지 판별한다(JSON·XML 양쪽 형태를 본다). */
function readErrorEnvelope(raw: string): string | null {
  if (!/OpenAPI_ServiceResponse|cmmMsgHeader|returnReasonCode/.test(raw)) return null
  const pick = (re: RegExp) => (raw.match(re) ?? []).slice(1).find(Boolean) ?? ''
  const code = pick(/<returnReasonCode>([^<]*)<|"returnReasonCode"\s*:\s*"([^"]*)"/)
  const msg = pick(/<errMsg>([^<]*)<|"errMsg"\s*:\s*"([^"]*)"/)
  const auth = pick(/<returnAuthMsg>([^<]*)<|"returnAuthMsg"\s*:\s*"([^"]*)"/)
  const parts = [msg, auth, code ? 'code=' + code : ''].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : '(사유 불명)'
}

async function fetchKaptBasicInfoFromUrl(
  baseUrl: string,
  kaptCode: string,
  apiKey: string,
): Promise<KaptBasicInfoOutcome> {
  const url = new URL(baseUrl)
  url.searchParams.set('ServiceKey', apiKey)
  url.searchParams.set('kaptCode', kaptCode)
  url.searchParams.set('_type', 'json')

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`K-apt BasicInfo API ${res.status}`)

  // 본문을 **텍스트로 먼저** 읽는다 — 에러 봉투가 XML 로 오는 경우가 있어 JSON 파싱만
  // 시도하면 그 사실을 잃는다(molit-unsold 에서 같은 함정을 이미 겪었다).
  const raw = await res.text()

  const envelope = readErrorEnvelope(raw)
  if (envelope) return { ok: false, reason: 'error_envelope', hint: envelope }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'schema_mismatch', hint: 'JSON 아님: ' + raw.slice(0, 120) }
  }

  const item = (json as { response?: { body?: { item?: unknown } } })?.response?.body?.item
  if (item === undefined || item === null || (Array.isArray(item) && item.length === 0)) {
    return { ok: false, reason: 'no_item', hint: 'response.body.item 없음' }
  }

  // 존재하지 않는 kaptCode 는 **빈 항목이 아니라 필드가 전부 null 인 항목**으로 돌아온다
  // (실측 2026-08-20: A99999999 → kaptCode:null, kaptName:null). 이걸 스키마에 넘기면
  // schema_mismatch 로 잡혀 "응답 구조가 바뀌었다" 는 잘못된 신호를 준다.
  // 식별자가 비어 있으면 그건 구조 문제가 아니라 **그 코드가 없는 것**이다.
  const ident = item as { kaptCode?: unknown; kaptName?: unknown }
  if (ident?.kaptCode == null && ident?.kaptName == null) {
    return { ok: false, reason: 'no_item', hint: 'kaptCode·kaptName 이 모두 null — 해당 코드 없음' }
  }

  const parsed = kaptBasicInfoSchema.safeParse(item)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 3)
      .map((i) => i.path.join('.') + ': ' + i.message)
      .join(' / ')
    return { ok: false, reason: 'schema_mismatch', hint: issues }
  }
  return { ok: true, data: parsed.data }
}

/**
 * 사유까지 돌려주는 형태. 새 코드는 이쪽을 쓴다.
 * 기존 `fetchKaptBasicInfo` 는 호출부가 8곳이라 시그니처를 유지한 얇은 래퍼로 남긴다.
 */
export async function fetchKaptBasicInfoDetailed(kaptCode: string): Promise<KaptBasicInfoOutcome> {
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

/** @deprecated 실패 사유를 알 수 없다. 새 코드는 `fetchKaptBasicInfoDetailed` 를 쓸 것. */
export async function fetchKaptBasicInfo(kaptCode: string): Promise<KaptBasicInfo | null> {
  const outcome = await fetchKaptBasicInfoDetailed(kaptCode)
  return outcome.ok ? outcome.data : null
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
