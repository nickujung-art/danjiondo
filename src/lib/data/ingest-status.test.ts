import { describe, expect, it } from 'vitest'

/*
  2026-09-29 — "전멸이 partial 로 접히던" 판정을 못 박는다.

  realprice.ts(ingestMonth·ingestMonthVilla)와 realprice-officetel.ts 가 같은 식을 쓴다.
  세 곳 모두 같은 규칙이어야 하므로 판정식만 떼어 시험한다.
  (전체 적재 경로는 DB·외부 API 의존이라 여기서 태우지 않는다.)
*/

/** 세 곳에 복제된 판정식과 같은 규칙 */
function decide(args: {
  rowsUpserted: number
  rowsFailed: number
  hasCriticalFailure: boolean
}): 'success' | 'partial' | 'failed' {
  const totalFailure = args.rowsUpserted === 0 && args.rowsFailed > 0
  return args.hasCriticalFailure || totalFailure
    ? 'failed'
    : args.rowsFailed > 0
      ? 'partial'
      : 'success'
}

describe('적재 상태 판정', () => {
  it('🔴 한 건도 못 넣고 실패만 있으면 failed — partial 이 아니다', () => {
    // 2026-08-02 사고: 152/152 실패인데 exit 0 이었다.
    expect(decide({ rowsUpserted: 0, rowsFailed: 152, hasCriticalFailure: false })).toBe('failed')
  })

  it('일부만 실패하면 partial', () => {
    expect(decide({ rowsUpserted: 148, rowsFailed: 4, hasCriticalFailure: false })).toBe('partial')
  })

  it('실패가 없으면 success', () => {
    expect(decide({ rowsUpserted: 152, rowsFailed: 0, hasCriticalFailure: false })).toBe('success')
  })

  it('가져온 행이 아예 없는 날은 success — 실패가 아니라 데이터가 없는 것이다', () => {
    // 공휴일·주말이면 신고가 0건일 수 있다. 그건 고장이 아니다.
    expect(decide({ rowsUpserted: 0, rowsFailed: 0, hasCriticalFailure: false })).toBe('success')
  })

  it('zod 실패율이 임계를 넘으면 적재 성공 여부와 무관하게 failed', () => {
    expect(decide({ rowsUpserted: 100, rowsFailed: 0, hasCriticalFailure: true })).toBe('failed')
  })

  it('failed 는 호출부와 신선도 점검이 이미 보는 값이다', () => {
    /*
      이 시험의 존재 이유 — 근원 한 곳을 고치면 나머지 둘이 따라온다.
        daily/route.ts        : if (result.status === 'failed') offiErrors++
        check-data-freshness  : FAILED_STATUSES = new Set(['failed'])
      전멸을 partial 로 두면 두 곳 다 그냥 지나친다.
    */
    const FAILED_STATUSES = new Set(['failed'])
    const status = decide({ rowsUpserted: 0, rowsFailed: 152, hasCriticalFailure: false })

    expect(FAILED_STATUSES.has(status)).toBe(true)
  })
})
