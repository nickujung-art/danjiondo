import { describe, it, expect } from 'vitest'
import { nameSim, norm } from './name-similarity'

/**
 * 이 함수는 거래를 어느 단지로 옮길지 **후보 순위**를 정하는 데 쓰인다. 순위가 거꾸로면
 * 사람이 잘못된 후보를 승인하게 된다 — 2026-08-24 에 실제로 그럴 뻔했다.
 *
 * 아래 기대값은 전부 그날 실측한 사례이고, 괄호 안 거리는 카카오/좌표 실측이다.
 */
describe('nameSim — 부분일치 과대평가 방지', () => {
  it('짧은 일반명이 긴 이름보다 높은 점수를 받지 않는다', () => {
    // 실측: 대우그린 ↔ 그린 은 3,989m 떨어진 남남이다
    const generic = nameSim('대우그린', '그린')
    // 실측: 동부산훼밀리2차아파트 ↔ 동부산훼미리2차 는 0m, 오타 1자 차이다
    const typo = nameSim('동부산훼밀리2차아파트', '동부산훼미리2차')
    expect(generic).toBeLessThan(0.9)
    // 짧은 일반명(2자)이 실제 같은 단지(오타)보다 크게 앞서면 순위가 거꾸로다
    expect(generic - typo).toBeLessThan(0.2)
  })

  it('부분일치 점수는 길이 비율에 비례한다', () => {
    expect(nameSim('그린', '그린')).toBe(1)                       // 완전 일치
    expect(nameSim('부영e그린5차', '부영e그린')).toBeGreaterThan(nameSim('대우그린', '그린'))
  })

  it('아주 짧은 일반명은 0.75 를 넘지 않는다', () => {
    const cases1: Array<[string, string]> = [['대우그린', '그린'], ['경남신포맨션', '경남'], ['월영화인아파트', '화인']]
    for (const [a, b] of cases1) {
      expect(nameSim(a, b)).toBeLessThanOrEqual(0.75)
    }
  })

  it('그래도 후보에서 탈락시키지는 않는다 (소비처 임계 0.3)', () => {
    // relink·audit 의 NAME_SIM_MIN 이 0.3 이다. 최종 판정자는 거리이므로
    // 후보 자체를 없애면 안 된다.
    const cases2: Array<[string, string]> = [['대우그린', '그린'], ['경남신포맨션', '경남']]
    for (const [a, b] of cases2) {
      expect(nameSim(a, b)).toBeGreaterThan(0.3)
    }
  })

  it('완전히 다른 이름은 낮다', () => {
    expect(nameSim('형제상가빌라', '송원상가빌라')).toBeLessThan(0.8)
    expect(nameSim('시영장미', '창원롯데캐슬')).toBeLessThan(0.3)
  })

  it('norm 은 괄호·공백·구분자를 걷어낸다', () => {
    expect(norm('비앤지스틸(주)사원')).toBe('비앤지스틸사원')
    expect(norm('마산 신화하니엘 더 마린')).toBe('마산신화하니엘더마린')
    expect(norm(null)).toBe('')
  })

  it('어순만 다른 이름도 후보로 남는다', () => {
    // 실측: 대원대동2차 ↔ 대원2차대동 은 0m, 같은 단지다
    expect(nameSim('대원대동2차', '대원2차대동')).toBeGreaterThan(0.3)
  })
})
