export type BadgeType = 'pre_sale' | 'new_build' | 'new_record' | 'high_volume' | 'popular' | 'none'

export interface BadgeInput {
  status:           string
  built_year:       number | null
  is_new_record_30d: boolean
  tx_count_30d:     number
  view_count:       number
  p95_view_count:   number
}

// 배지 우선순위: pre_sale > new_build > new_record > high_volume > popular > none
// - new_record: 최근 30일 신고가 경신 (단가 기준 +3% 이상)
// - high_volume: 최근 30일 거래 5건 이상 (절대값 기준 — 소규모 지역에서도 변별력 유지)
// - popular: 로드된 단지 중 조회수 상위 5% (상대값)
export function determineBadge(input: BadgeInput): BadgeType {
  if (input.status === 'pre_sale') return 'pre_sale'
  if (input.built_year !== null && input.built_year >= 2021) return 'new_build'
  if (input.is_new_record_30d) return 'new_record'
  if (input.tx_count_30d >= 5) return 'high_volume'
  if (input.p95_view_count > 0 && input.view_count >= input.p95_view_count) return 'popular'
  return 'none'
}
