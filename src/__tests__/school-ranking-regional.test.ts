/**
 * school_ranking RPC 회귀 테스트 — Phase 33 (경남 전체 확장)
 * p_si가 임의 문자열을 받고, gu 컬럼이 창원 5개 구 패턴 외에는 NULL로 폴백함을 검증.
 * 코드 변경 없이 기존 SQL 함수가 구 없는 시군구를 이미 올바르게 처리함을 증명 (RESEARCH.md Pattern 3).
 */
import { describe, it, expect } from 'vitest'
import { SKEY, admin } from './helpers/db'

describe.skipIf(!SKEY)('school_ranking RPC: 무구(無區) 시군구 처리 (integration)', () => {
  it('임의의 si 문자열도 에러 없이 처리된다 (allowlist 없음)', async () => {
    const { data, error } = await admin.rpc('school_ranking', {
      p_si: '존재하지않는시군구_테스트',
      p_school_type: 'elementary',
      p_metric: 'students_per_class',
    })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('김해시 데이터에서 창원 5개 구 패턴에 매칭 안 되는 행은 gu=null로 정상 폴백된다', async () => {
    // NOTE: 33-04 실행 중 발견 — facility_school↔complexes 매칭 데이터에 김해시 단지가
    // 창원 소재 학교와 연결된 기존 데이터 품질 이슈가 소수 존재함(예: si='김해시'인데
    // road_address가 '창원시 OO구'인 행이 섞임). 이는 Phase 33 범위 밖의 사전 존재 이슈이므로
    // "모든 행이 gu=null" 대신 "폴백 로직 자체가 정상 동작하는지"(null 발생 + gu 값이 있다면
    // 5개 알려진 구 이름 중 하나)를 검증한다. 상세는 deferred-items.md 참고.
    const { data, error } = await admin.rpc('school_ranking', {
      p_si: '김해시',
      p_school_type: 'elementary',
      p_metric: 'students_per_class',
    })
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
    const nullGuRows = (data ?? []).filter((row) => row.gu === null)
    expect(nullGuRows.length).toBeGreaterThan(0)
    const validGu = ['의창구', '성산구', '마산합포구', '마산회원구', '진해구']
    for (const row of data ?? []) {
      if (row.gu !== null) expect(validGu).toContain(row.gu)
    }
  })

  it('창원시(구 있음) 데이터가 있다면 gu가 5개 구 중 하나이거나 null이다', async () => {
    const { data, error } = await admin.rpc('school_ranking', {
      p_si: '창원시',
      p_school_type: 'elementary',
      p_metric: 'students_per_class',
    })
    expect(error).toBeNull()
    const validGu = ['의창구', '성산구', '마산합포구', '마산회원구', '진해구', null]
    for (const row of data ?? []) {
      expect(validGu).toContain(row.gu)
    }
  })
})
