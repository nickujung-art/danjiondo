import { describe, it, expect, vi } from 'vitest'
import { fetchKaptBasicInfo, fetchKaptBasicInfoDetailed } from '@/services/kapt'

/**
 * 2026-08-20 — 응답 본문을 `res.json()` 이 아니라 `res.text()` 로 먼저 읽도록 바뀌었다.
 * data.go.kr 은 쿼터 초과·키 오류를 **HTTP 200 + XML 에러 봉투**로 보내는데,
 * JSON 파싱만 시도하면 그 사실을 잃기 때문이다(molit-unsold 에서 겪은 함정과 같다).
 * 그래서 이 파일의 fetch 목은 반드시 `text()` 를 제공한다.
 */
function mockFetchText(body: unknown, ok = true) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(raw),
  }))
}

describe('fetchKaptBasicInfo (DATA-01)', () => {
  it('KAPT_API_KEY 미설정 시 에러를 throw한다', async () => {
    const orig = process.env.KAPT_API_KEY
    delete process.env.KAPT_API_KEY
    await expect(fetchKaptBasicInfo('A1234567')).rejects.toThrow('KAPT_API_KEY')
    process.env.KAPT_API_KEY = orig
  })

  it('API 응답이 올바른 경우 KaptBasicInfo를 반환한다', async () => {
    mockFetchText({ response: { body: { item: { kaptCode: 'A1234567', kaptName: '테스트아파트', kaptdaCnt: 300 } } } })
    const result = await fetchKaptBasicInfo('A1234567')
    expect(result?.kaptCode).toBe('A1234567')
    vi.unstubAllGlobals()
  })

  it('API 응답 item이 null이면 null을 반환한다 — 기존 호출부 8곳의 계약은 그대로다', async () => {
    mockFetchText({ response: { body: { item: null } } })
    const result = await fetchKaptBasicInfo('UNKNOWN')
    expect(result).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('fetchKaptBasicInfoDetailed — 실패 사유를 가른다', () => {
  it('정상이면 ok:true 와 데이터를 준다', async () => {
    mockFetchText({ response: { body: { item: { kaptCode: 'A1', kaptName: '가나아파트' } } } })
    const r = await fetchKaptBasicInfoDetailed('A1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.kaptName).toBe('가나아파트')
    vi.unstubAllGlobals()
  })

  it('🔴 item 이 없으면 no_item — 진짜 "대상 아님" 후보다', async () => {
    mockFetchText({ response: { body: { item: null } } })
    const r = await fetchKaptBasicInfoDetailed('UNKNOWN')
    expect(r).toMatchObject({ ok: false, reason: 'no_item' })
    vi.unstubAllGlobals()
  })

  it('🔴 XML 에러 봉투는 error_envelope 로 가른다 — 예전엔 no_item 과 구분되지 않아 조용히 스킵됐다', async () => {
    mockFetchText(
      '<OpenAPI_ServiceResponse><cmmMsgHeader>' +
        '<returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg>' +
        '<returnReasonCode>22</returnReasonCode>' +
        '</cmmMsgHeader></OpenAPI_ServiceResponse>',
    )
    const r = await fetchKaptBasicInfoDetailed('A1')
    expect(r).toMatchObject({ ok: false, reason: 'error_envelope' })
    if (!r.ok) {
      expect(r.hint).toContain('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR')
      expect(r.hint).toContain('code=22')
    }
    vi.unstubAllGlobals()
  })

  it('🔴 JSON 에러 봉투도 같은 사유로 가른다', async () => {
    mockFetchText({ cmmMsgHeader: { errMsg: 'SERVICE ERROR', returnReasonCode: '30' } })
    const r = await fetchKaptBasicInfoDetailed('A1')
    expect(r).toMatchObject({ ok: false, reason: 'error_envelope' })
    vi.unstubAllGlobals()
  })

  it('🔴 항목은 있는데 스키마와 다르면 schema_mismatch — 응답 구조가 바뀐 것이라 조용히 넘기면 안 된다', async () => {
    // kaptName 이 필수인데 없다
    mockFetchText({ response: { body: { item: { kaptCode: 'A1' } } } })
    const r = await fetchKaptBasicInfoDetailed('A1')
    expect(r).toMatchObject({ ok: false, reason: 'schema_mismatch' })
    if (!r.ok) expect(r.hint).toContain('kaptName')
    vi.unstubAllGlobals()
  })

  it('JSON 이 아니면 schema_mismatch 로 본다 — 조용한 성공보다 시끄러운 실패가 낫다', async () => {
    mockFetchText('<html><body>Gateway Timeout</body></html>')
    const r = await fetchKaptBasicInfoDetailed('A1')
    expect(r).toMatchObject({ ok: false, reason: 'schema_mismatch' })
    vi.unstubAllGlobals()
  })
})

describe('null 필드 처리 — 17개 단지가 계속 스킵되던 원인', () => {
  /**
   * 2026-08-20. K-apt 는 값이 없는 필드를 `null` 로 보내는데 `z.string().optional()` 은
   * `undefined` 만 받고 `null` 은 거부한다. 그래서 도로명주소가 없는 단지(신축·임대 등)는
   * `doroJuso: null` 하나 때문에 **단지 전체가 파싱 실패**했고, 호출부에는 그냥 `null` 이
   * 돌아가 "데이터 없는 단지" 로 취급됐다. 워크플로는 그 17개 때문에 영구히 빨간색이었다.
   */
  it('🔴 doroJuso 가 null 이어도 파싱된다 — 이것 하나로 단지 전체가 버려지고 있었다', async () => {
    mockFetchText({ response: { body: { item: {
      kaptCode: 'A10023958', kaptName: '광안KCC스위첸하버뷰', doroJuso: null,
    } } } })
    const r = await fetchKaptBasicInfoDetailed('A10023958')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.kaptName).toBe('광안KCC스위첸하버뷰')
    vi.unstubAllGlobals()
  })

  it('🔴 다른 optional 문자열이 null 이어도 파싱된다', async () => {
    mockFetchText({ response: { body: { item: {
      kaptCode: 'A1', kaptName: '가나', heatType: null, managementType: null,
      kaptUsedate: null, codeHeatNm: null, kaptAddr: null,
    } } } })
    const r = await fetchKaptBasicInfoDetailed('A1')
    expect(r.ok).toBe(true)
    vi.unstubAllGlobals()
  })

  it('🔴 식별자가 전부 null 이면 no_item — 없는 코드를 schema_mismatch 로 오인하지 않는다', async () => {
    mockFetchText({ response: { body: { item: { kaptCode: null, kaptName: null } } } })
    const r = await fetchKaptBasicInfoDetailed('A99999999')
    expect(r).toMatchObject({ ok: false, reason: 'no_item' })
    vi.unstubAllGlobals()
  })

  it('식별자는 있는데 필수 필드가 빠지면 여전히 schema_mismatch — 대조군', async () => {
    // kaptName 만 없다: 코드가 없는 게 아니라 구조가 이상한 것이다
    mockFetchText({ response: { body: { item: { kaptCode: 'A1' } } } })
    const r = await fetchKaptBasicInfoDetailed('A1')
    expect(r).toMatchObject({ ok: false, reason: 'schema_mismatch' })
    vi.unstubAllGlobals()
  })
})

/**
 * 2026-08-25 — 버전별 필드명 폴백이 **서비스 안**에 있는지 잠근다.
 *
 * [왜 이 테스트가 있어야 하나]
 * V1 은 heatType·managementType·totalArea 를, V4/V5 는 codeHeatNm·codeMgrNm·kaptTarea 를
 * 준다. 이 폴백이 호출부마다 흩어져 있었고 그래서 갈렸다 — `kapt-facility-enrich.ts` 와
 * `kapt-enrich.ts` 에는 있고 `app/api/cron/daily` 에는 **없었다.**
 *
 * 결과는 조용한 데이터 파괴였다. 일배치가 V1 이름만 읽어 null 을 얻고, 그 null 을
 * facility_kapt 에 upsert(onConflict: complex_id) 해서 enrich 가 채운 값을 지웠다.
 * updated_at 별 실측:
 *   2026-08-19  1,662행(enrich)  heat_type 43%
 *   2026-08-20~23  각 70행(일배치)         0%   ← 손댄 배치마다 정확히 0
 * 280행이 지워졌고 하루 70곳이면 28일에 전량이었다.
 *
 * 폴백이 다시 서비스 밖으로 나가면 같은 일이 반복된다.
 */
describe('버전별 필드명 폴백 (2026-08-25 회귀 방지)', () => {
  it('🔴 V5 이름만 와도 V1 이름으로 읽힌다 — 호출부가 V1 이름을 쓴다', async () => {
    mockFetchText({ response: { body: { item: {
      kaptCode: 'A63187201', kaptName: '씨티해오름',
      codeHeatNm: '개별난방', codeMgrNm: '자치관리', kaptTarea: '22083.63',
    } } } })
    const r = await fetchKaptBasicInfoDetailed('A63187201')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.heatType).toBe('개별난방')
      expect(r.data.managementType).toBe('자치관리')
      expect(r.data.totalArea).toBeCloseTo(22083.63)
    }
    vi.unstubAllGlobals()
  })

  it('V1 이름이 오면 그대로 쓰고 V5 이름으로 덮지 않는다', async () => {
    mockFetchText({ response: { body: { item: {
      kaptCode: 'A1', kaptName: '가나',
      heatType: '지역난방', managementType: '위탁관리', totalArea: '100',
      codeHeatNm: '개별난방', codeMgrNm: '자치관리', kaptTarea: '999',
    } } } })
    const r = await fetchKaptBasicInfoDetailed('A1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.heatType).toBe('지역난방')
      expect(r.data.managementType).toBe('위탁관리')
      expect(r.data.totalArea).toBeCloseTo(100)
    }
    vi.unstubAllGlobals()
  })

  it('양쪽 다 없으면 null 이다 — 없는 값을 지어내지 않는다', async () => {
    mockFetchText({ response: { body: { item: { kaptCode: 'A1', kaptName: '가나' } } } })
    const r = await fetchKaptBasicInfoDetailed('A1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.heatType).toBeNull()
      expect(r.data.managementType).toBeNull()
      expect(r.data.totalArea).toBeUndefined()
    }
    vi.unstubAllGlobals()
  })

  it('🔴 비2xx 의 사유가 에러 메시지에 실린다 — 상태 코드만 남기지 않는다', async () => {
    mockFetchText(JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: {
      errMsg: 'NO_OPENAPI_SERVICE_ERROR',
      returnAuthMsg: '해당 오픈API 서비스가 없거나 폐기됨',
      returnReasonCode: '12',
    } } }), false)
    await expect(fetchKaptBasicInfoDetailed('A1')).rejects.toThrow(/폐기됨/)
    vi.unstubAllGlobals()
  })
})
