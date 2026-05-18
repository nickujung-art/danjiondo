import aliases from './name-aliases.json'

// 단지/차 앞에 오는 한자 수 → 아라비아 수 (예: "일단지" → "1단지")
const SINO_UNIT_MAP = new Map([
  ['일', '1'], ['이', '2'], ['삼', '3'], ['사', '4'], ['오', '5'],
  ['육', '6'], ['칠', '7'], ['팔', '8'], ['구', '9'],
])

const SINO_UNIT_PATTERN = new RegExp(
  `(${[...SINO_UNIT_MAP.keys()].join('|')})(단지|차)`,
  'g',
)

export function nameNormalize(raw: string): string {
  let s = raw.normalize('NFC')

  // 운영자 관리 별칭 사전 치환 (JSON 파일 방식, 코드 변경 없이 PR로 갱신)
  for (const [pattern, replacement] of Object.entries(
    aliases as Record<string, string>,
  )) {
    s = s.replace(new RegExp(pattern, 'g'), replacement)
  }

  // 단지/차 앞 한자 수 변환 (단독 위치에서만 — "삼성" 같은 고유명 불변)
  s = s.replace(SINO_UNIT_PATTERN, (_, num, suffix) => {
    return `${SINO_UNIT_MAP.get(num) ?? num}${suffix}`
  })

  // 林 한자 → 림 (예: 자은프라林 → 자은프라림)
  s = s.replace(/林/g, '림')

  // '아파트' 접미사 제거
  s = s.replace(/아파트$/, '')

  // 공백·특수문자 제거 (콜론 포함 — 예: '다:숲' → '다숲')
  s = s.replace(/[\s\-\(\)\[\],\.·:]/g, '')

  // lowercase (영문 브랜드명 통일)
  s = s.toLowerCase()

  return s
}
