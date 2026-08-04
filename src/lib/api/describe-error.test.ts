import { describe, expect, it } from 'vitest'
import { describeError, isConnectivityError } from './describe-error'

/** undici 가 실제로 만드는 모양 — 겉은 늘 `TypeError: fetch failed`, 원인은 cause 안에 있다 */
function undiciFetchFailed(code: string, message = 'boom'): Error {
  const cause = Object.assign(new Error(message), { code })
  return Object.assign(new TypeError('fetch failed'), { cause })
}

describe('describeError', () => {
  it('cause 의 code 를 드러낸다 — 이게 없어 08-02 장애를 이틀간 못 짚었다', () => {
    const err = undiciFetchFailed('UND_ERR_CONNECT_TIMEOUT', 'Connect Timeout Error')
    const out = describeError(err)
    expect(out).toContain('TypeError: fetch failed')
    expect(out).toContain('UND_ERR_CONNECT_TIMEOUT')
    expect(out).toContain('Connect Timeout Error')
  })

  it('중첩된 cause 를 끝까지 따라간다', () => {
    const inner = Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' })
    const mid = Object.assign(new Error('socket hang up'), { cause: inner })
    const err = Object.assign(new TypeError('fetch failed'), { cause: mid })
    expect(describeError(err)).toContain('UND_ERR_SOCKET')
  })

  it('cause 가 없으면 기존처럼 name: message 만 남는다', () => {
    expect(describeError(new Error('그냥 에러'))).toBe('Error: 그냥 에러')
  })

  it('Error 가 아닌 값도 안전하게 문자열로 만든다', () => {
    expect(describeError('문자열 throw')).toBe('문자열 throw')
  })
})

describe('isConnectivityError', () => {
  it('연결 자체가 안 된 에러를 잡아낸다', () => {
    for (const code of ['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']) {
      expect(isConnectivityError(undiciFetchFailed(code))).toBe(true)
    }
  })

  it('서버가 응답은 한 실패(5xx·타임아웃)는 연결 문제로 보지 않는다', () => {
    // 연결은 됐는데 상대가 느린 경우 — 러너를 바꿔도 소용없으므로 재시도 대상이 아니다
    expect(isConnectivityError(Object.assign(new Error('MOLIT API 500'), { status: 500 }))).toBe(false)
    expect(isConnectivityError(new DOMException('timed out', 'TimeoutError'))).toBe(false)
  })

  it('Error 가 아닌 값은 false', () => {
    expect(isConnectivityError('nope')).toBe(false)
    expect(isConnectivityError(null)).toBe(false)
  })
})
