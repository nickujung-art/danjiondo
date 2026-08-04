import { describe, expect, it } from 'vitest'
import { resolveSafeMatch } from './safe-complex-match'

// 이 규칙이 느슨해지는 순간 **틀린 단지에 거래가 붙는다**. 실측에서 실제로 나온 위험 사례를
// 그대로 테스트로 박아 둔다 — 나중에 "회복률이 낮으니 좀 풀자"는 유혹을 막기 위한 것이다.

const c = (id: string, canonical_name: string) => ({
  id,
  sgg_code: '48123',
  dong: '반림동',
  canonical_name,
})
const tx = (raw: string) => ({ umd_nm: '반림동', raw_complex_name: raw })

describe('resolveSafeMatch — 붙여도 되는 경우', () => {
  it('이름이 완전히 같으면 붙인다', () => {
    expect(resolveSafeMatch(tx('노블파크'), [c('A', '노블파크')])?.id).toBe('A')
  })

  it('접미사가 "아파트"뿐이면 붙인다', () => {
    expect(resolveSafeMatch(tx('트리비앙'), [c('A', '트리비앙아파트')])?.id).toBe('A')
  })

  it('원본이 숫자로 끝나고 접미사가 "차"/"차아파트"면 붙인다', () => {
    // MOLIT 이 "한국2", "덕산타운1" 처럼 차수를 숫자만 남기고 보내는 경우
    expect(resolveSafeMatch(tx('한국2'), [c('A', '한국2차')])?.id).toBe('A')
    expect(resolveSafeMatch(tx('덕산타운1'), [c('A', '덕산타운1차아파트')])?.id).toBe('A')
  })
})

describe('resolveSafeMatch — 붙이면 안 되는 경우', () => {
  it('접미사에 차수·단지 번호가 있으면 거른다 — 형제 단지가 마스터에 없을 수 있다', () => {
    // 실측: 한일타운 377건이 한일타운4차아파트 하나에 붙을 뻔했다(1·2·3차가 따로 존재)
    expect(resolveSafeMatch(tx('한일타운'), [c('A', '한일타운4차아파트')])).toBeNull()
    expect(resolveSafeMatch(tx('휴먼빌'), [c('A', '휴먼빌2단지')])).toBeNull()
    expect(resolveSafeMatch(tx('대동'), [c('A', '대동1차황토방')])).toBeNull()
  })

  it('접미사가 완전히 다른 이름이면 거른다 — 숫자가 없어도 같은 단지가 아니다', () => {
    // 실측 338건: "대동" → "대동디지털황토". 숫자 없다고 안전한 게 아니다
    expect(resolveSafeMatch(tx('대동'), [c('A', '대동디지털황토')])).toBeNull()
    expect(resolveSafeMatch(tx('한일'), [c('A', '한일유앤아이')])).toBeNull()
  })

  it('허용 접미사라도 후보가 둘 이상이면 거른다', () => {
    expect(resolveSafeMatch(tx('현대'), [c('A', '현대'), c('B', '현대아파트')])).toBeNull()
  })

  it('후보가 없으면 null', () => {
    expect(resolveSafeMatch(tx('없는단지'), [c('A', '노블파크')])).toBeNull()
  })

  it('동 정보나 원본명이 없으면 시도조차 하지 않는다', () => {
    // 동을 모르면 구 단위로 넓혀야 하는데, 그러면 모호가 5배 는다(실측 386 → 1,841)
    expect(resolveSafeMatch({ umd_nm: null, raw_complex_name: '노블파크' }, [c('A', '노블파크')])).toBeNull()
    expect(resolveSafeMatch({ umd_nm: '반림동', raw_complex_name: null }, [c('A', '노블파크')])).toBeNull()
    expect(resolveSafeMatch({ umd_nm: '반림동', raw_complex_name: '   ' }, [c('A', '노블파크')])).toBeNull()
  })

  it('원본명이 후보보다 길면(부분 포함) 붙이지 않는다 — startsWith 는 한 방향이다', () => {
    expect(resolveSafeMatch(tx('노블파크2차'), [c('A', '노블파크')])).toBeNull()
  })
})
