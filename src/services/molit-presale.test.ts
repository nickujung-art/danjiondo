import { describe, it, expect, afterEach, vi } from 'vitest'
import { currentYearMonth, previousYearMonth } from './molit-presale'

/**
 * 일배치가 훑는 기간을 정하는 함수들이다. 여기가 틀리면 조용히 한 달치를 통째로
 * 놓친다 — 2026-08-24 에 오피스텔 일배치가 당월만 봐서 지난 달 거래의 22~62%를
 * 영구 누락하던 것이 정확히 그 부류였다.
 *
 * 특히 previousYearMonth 는 **1월 경계**가 유일한 위험 지점이다. 월에서 1을 빼는
 * 구현이 12월/전년으로 넘어가지 않으면 매년 1월에 한 달치가 사라진다.
 */
describe('previousYearMonth', () => {
  afterEach(() => { vi.useRealTimers() })

  const at = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)) }

  it('달 중간에서 전월을 돌려준다', () => {
    at('2026-08-24T10:00:00')
    expect(previousYearMonth()).toBe('202607')
  })

  it('1월이면 전년 12월로 넘어간다', () => {
    at('2026-01-15T10:00:00')
    expect(previousYearMonth()).toBe('202512')
  })

  it('3월 1일에도 2월을 돌려준다 (말일 수가 다른 달로 새지 않는다)', () => {
    at('2026-03-01T00:30:00')
    expect(previousYearMonth()).toBe('202602')
  })

  it('윤년 3월에도 2월을 돌려준다', () => {
    at('2028-03-31T23:00:00')
    expect(previousYearMonth()).toBe('202802')
  })

  it('항상 YYYYMM 6자리다', () => {
    at('2026-09-09T00:00:00')
    expect(previousYearMonth()).toMatch(/^\d{6}$/)
  })

  it('currentYearMonth 와 서로 다른 달을 가리킨다', () => {
    at('2026-08-24T10:00:00')
    expect(previousYearMonth()).not.toBe(currentYearMonth())
  })
})
