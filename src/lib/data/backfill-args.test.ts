import { describe, it, expect } from 'vitest'
import { monthRange, assertYearMonth, parseSggCodes } from './backfill-args'

describe('monthRange', () => {
  it('같은 연도 내 기간을 YYYYMM 배열로 전개한다 (기존 동작 보존)', () => {
    expect(monthRange('201501', '201503')).toEqual(['201501', '201502', '201503'])
  })

  it('연도를 넘기는 기간도 올바르게 전개한다 (기존 동작 보존)', () => {
    expect(monthRange('202512', '202602')).toEqual(['202512', '202601', '202602'])
  })
})

describe('assertYearMonth', () => {
  it('빈 문자열이면 throw 한다 — 이게 이 모듈의 존재 이유다: 빈 --from= 이 monthRange(NaN 비교)를 거쳐 0개월로 조용히 전개되고 "0건 upsert"로 exit 0 하던 경로를 여기서 막는다', () => {
    expect(() => assertYearMonth('from', '')).toThrow()
  })

  it('6자리가 아니면 throw 한다', () => {
    expect(() => assertYearMonth('from', '2015')).toThrow()
  })

  it('월이 13이면 throw 한다', () => {
    expect(() => assertYearMonth('from', '201513')).toThrow()
  })

  it('월이 00이면 throw 한다', () => {
    expect(() => assertYearMonth('from', '201500')).toThrow()
  })

  it('YYYYMM 형식이 올바르면 통과하고 그 값을 그대로 반환한다', () => {
    expect(assertYearMonth('from', '201501')).toBe('201501')
  })

  it('undefined 는 "인자 미지정"으로 보고 그대로 통과시킨다 (호출부가 기본값을 쓸 수 있어야 한다)', () => {
    expect(assertYearMonth('from', undefined)).toBeUndefined()
  })

  it('에러 메시지에 인자 이름(label)을 포함한다 — 어느 인자가 틀렸는지 로그로 판별 가능해야 한다', () => {
    expect(() => assertYearMonth('--to', '')).toThrow(/--to/)
  })
})

describe('parseSggCodes', () => {
  it('콤마로 구분된 코드를 공백 trim 후 배열로 반환한다', () => {
    expect(parseSggCodes('26230, 26260')).toEqual(['26230', '26260'])
  })

  it('빈 문자열이면 throw 한다 — regions 전체 38개 지역으로 조용히 확장되는 것을 막는다', () => {
    expect(() => parseSggCodes('')).toThrow()
  })

  it('5자리 숫자가 아닌 코드가 섞여 있으면 throw 한다', () => {
    expect(() => parseSggCodes('26230,abc')).toThrow()
  })

  it('undefined 는 "인자 미지정"으로 보고 그대로 통과시킨다 (호출부가 regions 조회로 폴백해야 한다)', () => {
    expect(parseSggCodes(undefined)).toBeUndefined()
  })
})
