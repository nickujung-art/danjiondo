// 학원 루트 최적화 유틸 (Phase 28)
// haversine 거리 + 경로 효율 스코어링 + Greedy TSP + 복수 과목 콤보 선택

import type { SubjectCategory, FeeTier } from '@/services/neis-hagwon'

export interface RawCandidate {
  id:               string
  name:             string
  address:          string | null
  hagwon_lat:       number
  hagwon_lng:       number
  realm_sc_nm:      string | null
  le_crse_nm:       string | null
  fee_tier:         string | null
  popularity_score: number | null
  age_groups:       string[]
  subject_category: string | null
  dist_home:        number
}

export interface ScoredCandidate extends RawCandidate {
  subject:          SubjectCategory | null
  individual_score: number
}

export interface RouteStep {
  label:      string
  distToNext: number  // 다음 지점까지 거리 (m)
}

export interface ComboResult {
  hagwons:        ScoredCandidate[]
  visitOrder:     number[]   // hagwons 배열 인덱스 (방문 순서)
  route:          RouteStep[]
  totalRouteDist: number     // 집→(학교→)학원들→집 총 거리 (m)
}

// ── haversine 거리 (m) ────────────────────────────────────────────────────────
const R = 6371000

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// ── 위치 점수 (0~1) ──────────────────────────────────────────────────────────
// 학교 미선택: 집 기준 2km 반경 선형 감쇠
// 학교 선택:  집-학교 경로 상에 얼마나 효율적으로 놓이는지 (타원 효율)
export function locationScore(
  homeLat: number, homeLng: number,
  hagwonLat: number, hagwonLng: number,
  schoolLat?: number, schoolLng?: number,
): number {
  const distHome = haversine(homeLat, homeLng, hagwonLat, hagwonLng)

  if (schoolLat == null || schoolLng == null) {
    return Math.max(0, 1 - distHome / 2000)
  }

  const distSchool = haversine(schoolLat, schoolLng, hagwonLat, hagwonLng)
  const dHS        = haversine(homeLat, homeLng, schoolLat, schoolLng)

  if (dHS < 100) return Math.max(0, 1 - distHome / 2000)

  // 타원 효율: 학원을 경유했을 때 추가 거리 비율
  const detourRatio = (distHome + distSchool) / dHS
  // detourRatio=1이면 완벽한 경로 상, 1.5이면 50% 돌아감
  const pathScore = Math.max(0, 1 - (detourRatio - 1) / 0.6)

  // 집 또는 학교에서 절대 거리 근접도
  const proximity = Math.max(0, 1 - Math.min(distHome, distSchool) / 1500)

  return 0.6 * pathScore + 0.4 * proximity
}

// ── 품질 점수 (0~1) ──────────────────────────────────────────────────────────
export function qualityScore(
  popularityScore: number | null,
  feeTier:         string | null,
  feeTiers:        FeeTier[],
  ageGroups:       string[],
  ageGroup?:       string,
): number {
  const popScore = popularityScore != null ? Number(popularityScore) : 0

  let feeScore: number
  if (feeTiers.length === 0) {
    feeScore = 0.7
  } else if (!feeTier) {
    feeScore = 0.4
  } else if (feeTiers.includes(feeTier as FeeTier)) {
    feeScore = 1.0
  } else {
    feeScore = 0.15
  }

  const ageScore = !ageGroup || ageGroups.includes(ageGroup) ? 1.0 : 0.2

  return 0.5 * popScore + 0.3 * feeScore + 0.2 * ageScore
}

// ── 개별 최종 점수 ────────────────────────────────────────────────────────────
export function individualScore(
  candidate: RawCandidate,
  homeLat: number, homeLng: number,
  feeTiers: FeeTier[],
  ageGroup?: string,
  schoolLat?: number, schoolLng?: number,
): number {
  const loc = locationScore(homeLat, homeLng, candidate.hagwon_lat, candidate.hagwon_lng, schoolLat, schoolLng)
  const qual = qualityScore(candidate.popularity_score, candidate.fee_tier, feeTiers, candidate.age_groups, ageGroup)
  return 0.45 * loc + 0.55 * qual
}

// ── Greedy Nearest Neighbor TSP ───────────────────────────────────────────────
// 시작점에서 가장 가까운 미방문 학원을 순서대로 선택
interface GPoint { lat: number; lng: number; idx: number }

function greedyRoute(
  startLat: number, startLng: number,
  endLat:   number, endLng:   number,
  points:   GPoint[],
): { order: number[]; totalDist: number } {
  const visited = new Set<number>()
  const order: number[] = []
  let curLat = startLat, curLng = startLng
  let totalDist = 0

  while (visited.size < points.length) {
    let bestIdx = -1, bestDist = Infinity
    for (const p of points) {
      if (visited.has(p.idx)) continue
      const d = haversine(curLat, curLng, p.lat, p.lng)
      if (d < bestDist) { bestDist = d; bestIdx = p.idx }
    }
    if (bestIdx === -1) break
    visited.add(bestIdx)
    order.push(bestIdx)
    totalDist += bestDist
    const p = points.find(x => x.idx === bestIdx)!
    curLat = p.lat; curLng = p.lng
  }

  totalDist += haversine(curLat, curLng, endLat, endLng)
  return { order, totalDist }
}

// ── 복수 과목 최적 조합 선택 ────────────────────────────────────────────────────
// perSubject: 과목별 Top-5 후보 (already scored)
// 모든 조합을 탐색 후 (avg_individual×0.7 + route_bonus×0.3) 최대 조합 반환
export function selectBestCombo(
  perSubject:  ScoredCandidate[][],
  homeLat:     number, homeLng:     number,
  schoolLat?:  number, schoolLng?:  number,
  schoolLabel?: string,
): ComboResult {
  const TOP = 5
  const pools = perSubject.map(s => s.slice(0, TOP))

  let bestScore = -Infinity
  let bestResult: ComboResult | null = null

  const selected: ScoredCandidate[] = new Array(pools.length)

  function search(si: number) {
    if (si === pools.length) {
      const startLat = schoolLat ?? homeLat
      const startLng = schoolLng ?? homeLng
      const points   = selected.map((h, i) => ({ lat: h.hagwon_lat, lng: h.hagwon_lng, idx: i }))
      const { order, totalDist } = greedyRoute(startLat, startLng, homeLat, homeLng, points)

      const avgInd = selected.reduce((s, h) => s + h.individual_score, 0) / selected.length

      // 기본 루트(집→학교→집) 대비 추가 이동 거리
      const firstHagwon = order[0] !== undefined ? selected[order[0]] : undefined
      const baseKm = schoolLat
        ? haversine(homeLat, homeLng, schoolLat, schoolLng!) * 2
        : firstHagwon
          ? haversine(homeLat, homeLng, firstHagwon.hagwon_lat, firstHagwon.hagwon_lng)
          : 0
      const extra = Math.max(0, totalDist - baseKm)
      const routeBonus = Math.max(0, 1 - extra / 4000)

      const score = 0.7 * avgInd + 0.3 * routeBonus

      if (score > bestScore) {
        bestScore = score
        // 루트 steps 구성
        const steps: RouteStep[] = []
        let prevLat = homeLat, prevLng = homeLng

        if (schoolLat != null && schoolLng != null) {
          steps.push({ label: '집', distToNext: haversine(homeLat, homeLng, schoolLat, schoolLng) })
          prevLat = schoolLat; prevLng = schoolLng
          steps.push({ label: schoolLabel ?? '학교', distToNext: 0 })
        } else {
          steps.push({ label: '집', distToNext: 0 })
        }

        for (const idx of order) {
          const h = selected[idx]
          if (!h) continue
          const prev = steps[steps.length - 1]
          if (prev) prev.distToNext = haversine(prevLat, prevLng, h.hagwon_lat, h.hagwon_lng)
          prevLat = h.hagwon_lat; prevLng = h.hagwon_lng
          steps.push({ label: h.name, distToNext: 0 })
        }
        const last = steps[steps.length - 1]
        if (last) last.distToNext = haversine(prevLat, prevLng, homeLat, homeLng)
        steps.push({ label: '집', distToNext: 0 })

        bestResult = { hagwons: selected.slice(), visitOrder: order, route: steps, totalRouteDist: totalDist }
      }
      return
    }
    for (const c of (pools[si] ?? [])) { selected[si] = c; search(si + 1) }
  }

  search(0)
  return bestResult!
}
