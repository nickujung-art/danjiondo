import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanSecret, requireSecret } from './clean-secret'

// 실장애 재현용 — 2026-08-10 GitHub Secret 앞에 붙어 있던 그 문자다.
const BOM = '﻿'

describe('cleanSecret', () => {
  it('앞머리 BOM 을 제거한다 — 2026-08-10 실장애 재현', () => {
    expect(cleanSecret(`${BOM}abc123`)).toBe('abc123')
  })

  it('문자열 중간·끝의 BOM 도 제거한다', () => {
    // 헤더 값은 어디에 있든 U+00FF 초과 문자를 허용하지 않는다.
    expect(cleanSecret(`ab${BOM}c${BOM}`)).toBe('abc')
  })

  it('앞뒤 공백·개행을 턴다 (붙여넣기에 딸려오는 경우)', () => {
    expect(cleanSecret('  abc123\n')).toBe('abc123')
    expect(cleanSecret(`${BOM}  abc123 \r\n`)).toBe('abc123')
  })

  it('멀쩡한 값은 그대로 둔다', () => {
    expect(cleanSecret('abc123')).toBe('abc123')
  })

  it('없거나 비면 undefined — 빈 문자열을 헤더에 실어 보내지 않는다', () => {
    expect(cleanSecret(undefined)).toBeUndefined()
    expect(cleanSecret(null)).toBeUndefined()
    expect(cleanSecret('')).toBeUndefined()
    expect(cleanSecret('   ')).toBeUndefined()
    expect(cleanSecret(BOM)).toBeUndefined()
  })

  it('결과에 U+00FF 를 넘는 문자가 남지 않는다 — 헤더 값의 실제 제약', () => {
    // fetch 는 헤더 값에 ByteString(0~255)만 허용한다. 그걸 넘는 문자가 하나라도 있으면
    // 요청이 나가기도 전에 TypeError 가 난다.
    //
    // `new Headers()` 로 직접 검증하지 않는 이유: 테스트 환경의 Headers 구현이 Node 실물
    // (undici)보다 관대해서 BOM 을 그냥 통과시킨다 — 환경에 따라 결과가 갈리는 테스트는
    // 신호가 되지 못한다. 그래서 **불변식 자체**를 검사한다.
    const cleaned = cleanSecret(`${BOM}test-key${BOM}`)!
    expect([...cleaned].every(ch => ch.charCodeAt(0) <= 255)).toBe(true)
    expect(cleaned).toBe('test-key')
  })
})

describe('requireSecret', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('BOM 이 붙어 있어도 씻어서 돌려준다', () => {
    vi.stubEnv('TEST_SECRET_X', `${BOM}value`)
    expect(requireSecret('TEST_SECRET_X')).toBe('value')
  })

  it('없으면 던진다 — 빈 값으로 조용히 진행하지 않는다', () => {
    vi.stubEnv('TEST_SECRET_X', '')
    expect(() => requireSecret('TEST_SECRET_X')).toThrow('TEST_SECRET_X')
  })
})
