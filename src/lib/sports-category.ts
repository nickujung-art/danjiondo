// 체육도장 업태명 → sport_type 분류 유틸

export type SportType =
  | 'taekwondo'
  | 'kendo'
  | 'judo'
  | 'hapkido'
  | 'boxing'
  | 'swimming'
  | 'gym'
  | 'etc'

export const SPORT_TYPE_LABEL: Record<SportType, string> = {
  taekwondo: '태권도',
  kendo:     '검도',
  judo:      '유도',
  hapkido:   '합기도',
  boxing:    '복싱',
  swimming:  '수영',
  gym:       '헬스',
  etc:       '기타체육',
}

const SPORT_KEYWORDS: Array<{ keywords: string[]; type: SportType }> = [
  { keywords: ['태권도', '跆拳道'],          type: 'taekwondo' },
  { keywords: ['검도', '劍道'],              type: 'kendo' },
  { keywords: ['유도', '柔道'],              type: 'judo' },
  { keywords: ['합기도', '합기'],            type: 'hapkido' },
  { keywords: ['복싱', '권투', '킥복싱'],   type: 'boxing' },
  { keywords: ['수영'],                      type: 'swimming' },
  { keywords: ['헬스', '피트니스', '체력단련', 'fitness'], type: 'gym' },
]

export function classifySport(uptaeNm: string): SportType {
  const normalized = uptaeNm.trim()
  for (const { keywords, type } of SPORT_KEYWORDS) {
    if (keywords.some(kw => normalized.includes(kw))) return type
  }
  return 'etc'
}
