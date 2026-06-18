/**
 * UX-02 — 평형 그룹 추출
 *
 * 두 가지 모드:
 * 1. TypedAreaGroup (area_type_id 있음): pyeong_name 기반 — "34A", "34B"
 * 2. 레거시 Math.round: area_type_id 없는 단지 fallback — "84㎡"
 */

// ── 레거시 (area_m2 Math.round 기반) ─────────────────────────────────────────

interface AreaPoint {
  area: number
}

export function extractAreaGroups<T extends AreaPoint>(points: T[]): number[] {
  if (points.length === 0) return []
  const counts = new Map<number, number>()
  for (const p of points) {
    const key = Math.round(p.area)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([area]) => area)
}

export function filterByArea<T extends AreaPoint>(points: T[], targetArea: number): T[] {
  const target = Math.round(targetArea)
  return points.filter(p => Math.round(p.area) === target)
}

// ── Typed (area_type_id / pyeong_name 기반, 없으면 Math.round fallback) ───────

export interface TypedAreaGroup {
  key:     string   // URL 파라미터용: pyeong_name ("34A") 또는 Math.round 문자열 ("84")
  label:   string   // 칩 표시: "34A" 또는 "84㎡"
  isNamed: boolean  // true = 네이버 공식 평형명
}

interface TypedAreaPoint extends AreaPoint {
  areaTypeId: string | null
  pyeongName: string | null
}

export function extractTypedAreaGroups<T extends TypedAreaPoint>(points: T[]): TypedAreaGroup[] {
  if (points.length === 0) return []

  const counts = new Map<string, number>()
  const meta   = new Map<string, TypedAreaGroup>()

  for (const p of points) {
    let key: string, label: string, isNamed: boolean
    if (p.areaTypeId && p.pyeongName) {
      key     = p.pyeongName
      label   = p.pyeongName
      isNamed = true
    } else {
      key     = String(Math.round(p.area))
      label   = `${Math.round(p.area)}㎡`
      isNamed = false
    }
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (!meta.has(key)) meta.set(key, { key, label, isNamed })
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => meta.get(key)!)
}

export function filterByTypedArea<T extends TypedAreaPoint>(points: T[], groupKey: string): T[] {
  // pyeong_name 매칭 우선
  const namedMatch = points.filter(p => p.pyeongName === groupKey)
  if (namedMatch.length > 0) return namedMatch
  // Math.round fallback
  const roundKey = parseInt(groupKey, 10)
  if (Number.isFinite(roundKey)) {
    return points.filter(p => !p.areaTypeId && Math.round(p.area) === roundKey)
  }
  return []
}
