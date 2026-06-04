// src/lib/hagwon-category.ts
// 학원 카테고리 분류 + 도보 시간 색상 순수 유틸

export type HagwonCategory = '수학' | '영어' | '예체능' | '국어' | '과학' | '중국어/일어' | '기타'
export type WalkColor = 'green' | 'yellow' | 'red'

const CATEGORY_KEYWORDS: Array<{ keywords: string[]; category: HagwonCategory }> = [
  { keywords: ['수학', '수능수학', '연산', '수과학'], category: '수학' },
  { keywords: ['영어', '어학', '영수', 'English', 'EFL'], category: '영어' },
  { keywords: ['미술', '아트', '미대', '공예', '피아노', '음악', '체육', '무용', '발레'], category: '예체능' },
  { keywords: ['국어', '논술', '독서', '글쓰기', '문해'], category: '국어' },
  { keywords: ['과학', '화학', '물리', '생물', 'STEM'], category: '과학' },
  { keywords: ['중국어', '일어', '일본어', '한자'], category: '중국어/일어' },
]

export function classifyHagwon(poiName: string): HagwonCategory {
  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.some(kw => poiName.includes(kw))) return category
  }
  return '기타'
}

export function walkColor(distanceM: number | null): WalkColor {
  if (distanceM == null) return 'green'
  const min = distanceM / 67
  if (min <= 10) return 'green'
  if (min <= 15) return 'yellow'
  return 'red'
}

export const WALK_COLOR_HEX: Record<WalkColor, string> = {
  green:  '#16a34a',
  yellow: '#d97706',
  red:    '#dc2626',
}
