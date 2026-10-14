/**
 * 분양 예정 뉴스 수집(`scripts/crawl-presale-news.ts`)의 대상 판정 — 순수 함수만.
 *
 * ⚠️ 대상은 일부러 하드코딩한다. `regions(is_active)` 는 운영권역보다 넓다(경남 18개 시군 + 부산).
 * 2026-07-06 `2aa2153` 이 그걸로 대상을 넓히자 진주·고성 같은 짧은 지명이 전국 기사에 부분일치해
 * 9주간 적재분의 93% 가 경남 밖이었다. 운영권역 정본: CLAUDE.md "운영권역 시군구 코드".
 */

export type NewsTargetRegion = '창원시' | '김해시'

interface NewsTargetCity {
  short: string
  region: NewsTargetRegion
}

// 마산·진해는 창원 통합 이전 지명이지만 뉴스 검색 관행상 유지한다
const NEWS_TARGET_CITIES: readonly NewsTargetCity[] = [
  { short: '창원', region: '창원시' },
  { short: '마산', region: '창원시' },
  { short: '진해', region: '창원시' },
  { short: '김해', region: '김해시' },
]

const TARGET_REGIONS: readonly NewsTargetRegion[] = ['창원시', '김해시']

export function buildNewsQueries(): string[] {
  return NEWS_TARGET_CITIES.flatMap(({ short }) => [
    `${short} 아파트 분양 예정`,
    `${short} 아파트 분양`,
    `${short} 분양 2026`,
  ])
}

/** 1차 거름. 기사 본문에 대상 지명이 있는지만 본다 — 최종 판정은 `resolveTargetRegion` */
export function mentionsTargetCity(text: string): boolean {
  return NEWS_TARGET_CITIES.some(c => text.includes(c.short))
}

/**
 * 카카오 주소(`address_name`, 예: "경남 창원시 성산구 …")로 적재 지역을 정한다.
 * 주소를 모르거나 운영권역 밖이면 null — 적재하지 않는다.
 * (이전엔 모르면 `'경남'` 을 넣어 "모름"이 "경남"으로 둔갑했다)
 */
export function resolveTargetRegion(address: string | null | undefined): NewsTargetRegion | null {
  if (!address) return null
  return TARGET_REGIONS.find(r => address.includes(r)) ?? null
}

export interface NewsRunstat {
  status: 'ok' | 'failed'
  /** 감지된 단지 후보 수 */
  items: number
  /** 창원·김해로 적재된 수. 0 은 정상일 수 있다(주당 0~1건이 기대치) */
  target: number
}

export function formatRunstat({ status, items, target }: NewsRunstat): string {
  return `[runstat] job=crawl-presale-news status=${status} items=${items} target=${target}`
}
