/**
 * Step3 수용 기준 통합 테스트
 * - data_sources 6건 이상
 * - regions 창원·김해 sgg_code 6건
 * - sgg_code: 국토부 LAWD_CD + 행안부 admCd 형식 검증
 */
import { describe, it, expect } from 'vitest'
import { SKEY, admin } from './helpers/db'

// 경상남도(48) 창원·김해 시군구코드 (국토부 LAWD_CD 기준) — 기존 6개, 하위 호환 유지
const CHANGWON_GIMHAE_SGG_CODES = ['48121', '48123', '48125', '48127', '48129', '48250'] as const
// 경남 확장 16개 시군구코드 (Phase 33 — 진주·통영·사천·밀양·거제·양산 + 10개 군)
const GYEONGNAM_EXPANSION_SGG_CODES = [
  '48170', '48220', '48240', '48270', '48310', '48330',
  '48720', '48730', '48740', '48820', '48840', '48850', '48860', '48870', '48880', '48890',
] as const
const LAWD_CD_REGEX = /^\d{5}$/

describe('step3: sgg_code 형식 (unit)', () => {
  it('국토부 LAWD_CD: 5자리 숫자 형식', () => {
    for (const code of CHANGWON_GIMHAE_SGG_CODES) {
      expect(code).toMatch(LAWD_CD_REGEX)
    }
  })

  it('행안부 admCd 호환: 시도코드 48(경남) 접두사', () => {
    // 행안부 admCd = 시도(2)+시군구(3)+읍면동(5) = 10자리
    // sgg_code 5자리는 admCd 앞 5자리와 동일
    for (const code of CHANGWON_GIMHAE_SGG_CODES) {
      expect(code.startsWith('48')).toBe(true)
    }
  })

  it('창원시 구코드: 481XX 범위', () => {
    const changwonCodes = CHANGWON_GIMHAE_SGG_CODES.filter(c => c.startsWith('481'))
    expect(changwonCodes).toHaveLength(5)
  })

  it('김해시 코드: 48250', () => {
    expect(CHANGWON_GIMHAE_SGG_CODES).toContain('48250')
  })
})

describe.skipIf(!SKEY)('step3: DB 시드 (integration)', () => {
  it('data_sources: 6건 이상 존재', async () => {
    const { count, error } = await admin
      .from('data_sources')
      .select('*', { count: 'exact', head: true })
    expect(error).toBeNull()
    expect(count).toBeGreaterThanOrEqual(6)
  })

  it('data_sources: cadence 값 유효', async () => {
    const { data, error } = await admin.from('data_sources').select('id, cadence')
    expect(error).toBeNull()
    const validCadences = ['daily', 'monthly', 'quarterly', 'annual', 'event', 'manual']
    for (const row of data ?? []) {
      expect(validCadences).toContain(row.cadence)
    }
  })

  it('regions: 창원·김해 sgg_code 6건 존재', async () => {
    const { data, error } = await admin
      .from('regions')
      .select('sgg_code')
      .in('sgg_code', CHANGWON_GIMHAE_SGG_CODES)
    expect(error).toBeNull()
    expect(data).toHaveLength(6)
  })

  it('regions: 경남 전체 22개 시군구 존재', async () => {
    const { count, error } = await admin
      .from('regions')
      .select('sgg_code', { count: 'exact', head: true })
    expect(error).toBeNull()
    // upsert 기반 시딩이므로 이후 재확장 대비 >= 사용
    expect(count).toBeGreaterThanOrEqual(22)
  })

  it('regions: 경남 확장 16개 시군구 gu=null', async () => {
    const { data, error } = await admin
      .from('regions')
      .select('sgg_code, gu')
      .in('sgg_code', GYEONGNAM_EXPANSION_SGG_CODES)
    expect(error).toBeNull()
    expect(data).toHaveLength(16)
    for (const row of data ?? []) {
      expect(row.gu, `sgg_code '${row.sgg_code}' gu must be null`).toBeNull()
    }
  })

  it('regions.sgg_code: 전체 레코드 LAWD_CD 형식 일치', async () => {
    const { data, error } = await admin.from('regions').select('sgg_code')
    expect(error).toBeNull()
    for (const row of data ?? []) {
      expect(row.sgg_code, `sgg_code '${row.sgg_code}' must match ${LAWD_CD_REGEX}`).toMatch(LAWD_CD_REGEX)
    }
  })
})
