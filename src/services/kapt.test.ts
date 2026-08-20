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
