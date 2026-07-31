import { describe, expect, it } from 'vitest'
import {
  allowedNumbers,
  applySpellFixes,
  buildCommentaryPrompt,
  fallbackCommentary,
  formatEok,
  normalizeWhitespace,
  pickSlots,
  rotationSeed,
  validateCommentary,
  type CommentaryFacts,
} from '../regional-commentary-style'

const BASE: CommentaryFacts = {
  shortLabel: '의창구',
  txCount: 42,
  txDiff: 5,
  topDeal: { complexName: '유니시티1단지', price: 92000, pyeong: 34, floor: 12 },
  upComplexes: 18,
  downComplexes: 12,
}

/** 검증을 통과하는 기준 문장 — 개별 테스트는 여기서 한 군데씩만 망가뜨린다 */
const GOOD =
  '지난주 의창구에서는 아파트 42건이 거래돼 직전 주보다 5건 늘었어요. 가장 비싼 거래는 유니시티1단지 34평 12층 9억 2,000만원이었어요. 최근 30일 변동률 기준으로는 상승 단지 18곳, 하락 단지 12곳이에요.'

describe('rotationSeed', () => {
  it('같은 주·같은 지역이면 항상 같은 시드를 준다', () => {
    expect(rotationSeed('2026-07-20', 2)).toBe(rotationSeed('2026-07-20', 2))
  })

  it('같은 주라도 지역이 다르면 시드가 다르다', () => {
    const seeds = [0, 1, 2, 3, 4, 5].map((i) => rotationSeed('2026-07-20', i))
    expect(new Set(seeds).size).toBe(6)
  })

  it('다음 주가 되면 같은 지역의 시드가 밀린다', () => {
    expect(rotationSeed('2026-07-27', 0)).not.toBe(rotationSeed('2026-07-20', 0))
  })
})

describe('pickSlots', () => {
  it('한 주 안에서 6개 지역이 서로 다른 개시 어구를 받는다', () => {
    // 6개 카드가 홈에 세로로 쌓이므로 개시부가 겹치면 폼 채우기로 읽힌다.
    // 어구가 3종뿐이면 비둘기집 원리로 최소 3곳이 반드시 충돌해 폴백으로 떨어졌다.
    const leads = [0, 1, 2, 3, 4, 5].map(
      (i) => pickSlots({ ...BASE, shortLabel: '의창구' }, rotationSeed('2026-07-20', i)).lead,
    )
    expect(new Set(leads).size).toBe(6)
  })

  it('최고가 거래가 없으면 최고가 개시부를 고르지 않는다', () => {
    const noTop = { ...BASE, topDeal: null }
    for (let seed = 0; seed < 20; seed++) {
      expect(pickSlots(noTop, seed).openerId).not.toBe('top_deal')
    }
  })

  it('재시도(attempt)마다 슬롯 조합이 실제로 바뀐다', () => {
    const a = pickSlots(BASE, 100, 0)
    const b = pickSlots(BASE, 100, 1)
    expect([a.openerId, a.volumePhrase, a.breadthPhrase]).not.toEqual([
      b.openerId,
      b.volumePhrase,
      b.breadthPhrase,
    ])
  })

  it('거래가 늘었으면 증가 표현만, 줄었으면 감소 표현만 만든다', () => {
    for (let seed = 0; seed < 12; seed++) {
      expect(pickSlots({ ...BASE, txDiff: 5 }, seed).volumePhrase).toMatch(/늘었|더 거래됐|많아졌/)
      expect(pickSlots({ ...BASE, txDiff: -5 }, seed).volumePhrase).toMatch(/줄었|덜 거래됐|적었/)
      expect(pickSlots({ ...BASE, txDiff: 0 }, seed).volumePhrase).toMatch(/같/)
    }
  })
})

describe('formatEok', () => {
  it('억과 만원을 함께 쓴다', () => {
    expect(formatEok(92000)).toBe('9억 2,000만원')
  })

  it('만원 자리가 0이면 억만 쓴다', () => {
    expect(formatEok(90000)).toBe('9억원')
  })

  it('1억 미만은 만원으로만 쓴다', () => {
    expect(formatEok(8500)).toBe('8,500만원')
  })
})

describe('applySpellFixes', () => {
  it('국어에 없는 "이예요"를 "이에요"로 고친다', () => {
    expect(applySpellFixes('12곳이예요.')).toBe('12곳이에요.')
  })

  it('"됬"을 "됐"으로 고친다', () => {
    expect(applySpellFixes('거래됬어요.')).toBe('거래됐어요.')
  })

  it('올바른 "예요"는 건드리지 않는다', () => {
    expect(applySpellFixes('같은 건수예요.')).toBe('같은 건수예요.')
  })
})

describe('normalizeWhitespace', () => {
  it('줄바꿈을 한 칸 공백으로 접는다', () => {
    expect(normalizeWhitespace('첫 문장이에요.\n\n두 번째예요.')).toBe('첫 문장이에요. 두 번째예요.')
  })

  it('접은 뒤에도 문장 수는 그대로 세어진다', () => {
    // 줄바꿈만 정규화하고 군더더기 문장은 여전히 문장 수 검사가 잡아야 한다
    const text = normalizeWhitespace('가.\n나.\n다.\n라.')
    expect(text.split(/(?<=[.!?])\s+/).length).toBe(4)
  })
})

describe('allowedNumbers', () => {
  it('금액을 억·만 단위로 쪼개 함께 허용한다', () => {
    const set = allowedNumbers(BASE)
    expect(set.has(9)).toBe(true)
    expect(set.has(2000)).toBe(true)
  })

  it('단지명 안의 숫자도 허용한다', () => {
    expect(allowedNumbers(BASE).has(1)).toBe(true) // 유니시티1단지
  })

  it('입력에 없는 숫자는 허용하지 않는다', () => {
    expect(allowedNumbers(BASE).has(777)).toBe(false)
  })
})

describe('validateCommentary', () => {
  it('규칙을 지킨 문장은 통과시킨다', () => {
    const result = validateCommentary(GOOD, BASE)
    expect(result.violations).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('입력에 없는 숫자를 지어내면 반려한다', () => {
    const text = GOOD.replace('42건', '47건')
    expect(validateCommentary(text, BASE).violations.join()).toContain('입력에 없는 숫자: 47')
  })

  it('금액을 "약 9억"으로 뭉개면 반려한다', () => {
    // 실거래 사이트에서 반올림은 신뢰 문제라 통과시키지 않는다
    const text = GOOD.replace('9억 2,000만원', '약 9억 2천만원')
    expect(validateCommentary(text, BASE).ok).toBe(false)
  })

  it('증가인데 감소로 서술하면 반려한다', () => {
    const text = GOOD.replace('5건 늘었어요', '5건 줄었어요')
    expect(validateCommentary(text, BASE).violations.join()).toContain('증감 방향 반전')
  })

  it('해요체가 아니면 반려한다', () => {
    const text = GOOD.replace('12곳이에요.', '12곳입니다.')
    expect(validateCommentary(text, BASE).ok).toBe(false)
  })

  it('데이터에 없는 평가어를 쓰면 반려한다', () => {
    const text = GOOD.replace('거래돼', '거래에 머물렀고')
    expect(validateCommentary(text, BASE).violations.join()).toContain('데이터에 없는 평가')
  })

  it('투자 권유 표현을 반려한다', () => {
    const text = GOOD.replace('가장 비싼 거래는', '주목할 만한 거래는')
    expect(validateCommentary(text, BASE).violations.join()).toContain('투자 권유')
  })

  it('번역투 "N건의 거래가 있었어요"를 반려한다', () => {
    const text =
      '지난주 의창구에서는 아파트 42건의 매매 거래가 있었어요. 직전 주보다 5건 늘었어요. 최근 30일 변동률 기준으로는 상승 단지 18곳, 하락 단지 12곳이에요.'
    expect(validateCommentary(text, BASE).violations.join()).toContain('번역투')
  })

  it('"최근 30일"을 빠뜨리면 반려한다', () => {
    const text = GOOD.replace('최근 30일 변동률 기준으로는 ', '')
    expect(validateCommentary(text, BASE).violations.join()).toContain('"최근 30일" 0회')
  })

  it('문장이 4개면 반려한다', () => {
    const text = `${GOOD} 다른 단지도 거래됐어요.`
    expect(validateCommentary(text, BASE).violations.join()).toContain('문장 수 4개')
  })

  it('한자가 섞이면 반려한다', () => {
    // llama-3.1-8b 가 한국어 도중 "最近 30일", "최다价은" 처럼 한자로 새는 일이 있었다
    const text = GOOD.replace('최근 30일', '最近 30일')
    expect(validateCommentary(text, BASE).violations.join()).toContain('한자 혼입')
  })

  it('쉼표로 문장을 이어붙이면 반려한다', () => {
    const text = GOOD.replace('늘었어요. 가장', '늘었어요, 가장')
    expect(validateCommentary(text, BASE).violations.join()).toContain('쉼표 이어쓰기')
  })

  it('"거래는 N건이 거래됐어요" 중복 표현을 반려한다', () => {
    const text = GOOD.replace('아파트 42건이 거래돼', '아파트 거래는 42건이 거래됐고')
    expect(validateCommentary(text, BASE).violations.join()).toContain('거래 중복 표현')
  })

  it('날짜를 그대로 쓰면 반려한다', () => {
    const text = GOOD.replace('지난주', '2026-07-20 주')
    expect(validateCommentary(text, BASE).violations.join()).toContain('날짜 표기')
  })

  it('지역명을 빠뜨리면 반려한다', () => {
    // 실제로 김해시가 "지난주에는 아파트 99건이…"로 지역명 없이 나왔다
    const text = GOOD.replace('의창구에서는', '이 지역에서는')
    expect(validateCommentary(text, BASE).violations.join()).toContain('지역명 누락')
  })

  it('거래 건수를 빠뜨리면 반려한다', () => {
    // 마산회원구가 "직전 주보다 8건 줄었어요"만 쓰고 총 건수를 뺐다
    const text = GOOD.replace('아파트 42건이 거래돼 ', '')
    expect(validateCommentary(text, BASE).violations.join()).toContain('거래 건수 누락')
  })

  it('최고가 단지명을 빠뜨리면 반려한다', () => {
    const text = GOOD.replace('유니시티1단지 34평 12층 9억 2,000만원', '한 단지')
    expect(validateCommentary(text, BASE).violations.join()).toContain('최고가 단지 누락')
  })

  it('억 자리를 틀리게 쓰면 반려한다 — 숫자 집합 검사만으로는 못 잡던 구멍', () => {
    // 실제로 "5억 2,500만원"을 "6억 2,500만원"으로 쓴 출력이 통과했다(그 단지가 6층이라 6이 허용됐다)
    const sixFloor: CommentaryFacts = {
      ...BASE,
      topDeal: { complexName: '신리마을중앙하이츠8단지', price: 52500, pyeong: 39, floor: 6 },
    }
    const text =
      '지난주 의창구에서는 아파트 42건이 거래돼 직전 주보다 5건 늘었어요. 가장 비싼 거래는 신리마을중앙하이츠8단지 39평 6층 6억 2,500만원이었어요. 최근 30일 변동률 기준으로는 상승 단지 18곳, 하락 단지 12곳이에요.'
    expect(validateCommentary(text, sixFloor).violations.join()).toContain('최고가 금액 불일치')
  })

  it('최고가 거래 자체가 없으면 단지명을 요구하지 않는다', () => {
    const noTop = { ...BASE, topDeal: null }
    const text =
      '지난주 의창구에서는 아파트 42건이 거래돼 직전 주보다 5건 늘었어요. 최근 30일 변동률 기준으로는 상승 단지 18곳, 하락 단지 12곳이에요.'
    expect(validateCommentary(text, noTop).violations).toEqual([])
  })

  it('앞 지역과 개시부가 같으면 반려한다', () => {
    const first = validateCommentary(GOOD, BASE)
    const sibling: CommentaryFacts = { ...BASE, shortLabel: '성산구' }
    const siblingText = GOOD.replaceAll('의창구', '성산구')
    const second = validateCommentary(siblingText, sibling, new Set([first.openingSignature]))
    expect(second.violations.join()).toContain('개시부 동일')
  })

  it('개시부 서명은 지역명과 숫자를 지운 어절 골격이다', () => {
    // 지역·숫자만 다른 문장은 사람 눈에 "같은 문장"으로 읽히므로 같은 서명이어야 한다
    const a = validateCommentary(GOOD, BASE).openingSignature
    const b = validateCommentary(
      GOOD.replaceAll('의창구', '성산구').replace('42건', '31건'),
      { ...BASE, shortLabel: '성산구', txCount: 31 },
    ).openingSignature
    expect(a).toBe(b)
  })
})

describe('buildCommentaryPrompt', () => {
  it('증감·상승하락 표현을 따옴표로 박아 넘긴다', () => {
    const slots = pickSlots(BASE, 0)
    const prompt = buildCommentaryPrompt(BASE, slots)
    expect(prompt).toContain(`"${slots.volumePhrase}"`)
    expect(prompt).toContain(`"${slots.breadthPhrase}"`)
  })

  it('예시 숫자를 999로 둬서 그대로 베끼면 검증에 걸리게 한다', () => {
    expect(buildCommentaryPrompt(BASE, pickSlots(BASE, 0))).toContain('999')
    expect(allowedNumbers(BASE).has(999)).toBe(false)
  })

  it('평균 평당가는 아예 넣지 않는다', () => {
    // 필수 사실 3가지를 2~3문장에 담아야 해서, 평당가를 주면 최고가 거래가 밀려난다
    expect(buildCommentaryPrompt(BASE, pickSlots(BASE, 0))).not.toContain('평당가')
  })
})

describe('fallbackCommentary', () => {
  it('모든 시드에서 자기 검증을 통과한다', () => {
    // 폴백은 최후 방어선이라 스스로 규칙을 어기면 안 된다
    for (let seed = 0; seed < 24; seed++) {
      const slots = pickSlots(BASE, seed)
      const text = fallbackCommentary(BASE, slots)
      expect(validateCommentary(text, BASE).violations).toEqual([])
    }
  })

  it('최고가 거래가 없어도 문장을 만든다', () => {
    const noTop = { ...BASE, topDeal: null }
    const text = fallbackCommentary(noTop, pickSlots(noTop, 3))
    expect(validateCommentary(text, noTop).violations).toEqual([])
  })

  it('6개 지역이 모두 폴백으로 떨어져도 개시부가 겹치지 않는다', () => {
    // 폴백은 여러 지역에서 동시에 날 수 있으므로 폴백끼리도 서로 달라야 한다
    const signatures = new Set(
      [0, 1, 2, 3, 4, 5].map((i) => {
        const slots = pickSlots(BASE, rotationSeed('2026-07-20', i))
        return validateCommentary(fallbackCommentary(BASE, slots), BASE).openingSignature
      }),
    )
    expect(signatures.size).toBe(6)
  })

  it('개시 어구에 맞춰 어미를 바꾼다', () => {
    // "…거래는 32건이 거래돼" 같은 비문이 나오면 안 된다
    for (let seed = 0; seed < 24; seed++) {
      const text = fallbackCommentary(BASE, pickSlots(BASE, seed))
      expect(text).not.toMatch(/거래는 아파트/)
      expect(text).not.toMatch(/아파트 거래는 \d+건이 거래돼/)
    }
  })
})
