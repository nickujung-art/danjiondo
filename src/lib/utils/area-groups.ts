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

// ── Typed (area_type_id 기반, 없으면 Math.round fallback) ────────────────────

export interface TypedAreaGroup {
  key:        string         // URL 파라미터: pyeong_name ("34A") 또는 Math.round 문자열 ("84")
  label:      string         // 칩 표시: "84.73㎡" (네이버 canonical) 또는 "84㎡" (fallback)
  isNamed:    boolean        // true = 네이버 매핑 완료
  pyeongName: string | null  // 툴팁용 타입명 ("34A") — isNamed=true 시에만
}

interface TypedAreaPoint extends AreaPoint {
  areaTypeId:      string | null
  pyeongName:      string | null
  exclusiveAreaM2: number | null  // 네이버 canonical 전용면적 — 칩 레이블 기준
}

export function extractTypedAreaGroups<T extends TypedAreaPoint>(points: T[]): TypedAreaGroup[] {
  if (points.length === 0) return []

  const counts = new Map<string, number>()
  const meta   = new Map<string, TypedAreaGroup>()

  for (const p of points) {
    let key: string, label: string, isNamed: boolean, pyeongName: string | null
    if (p.areaTypeId && p.pyeongName) {
      key        = p.pyeongName
      label      = p.exclusiveAreaM2 != null ? `${p.exclusiveAreaM2}㎡` : p.pyeongName
      isNamed    = true
      pyeongName = p.pyeongName
    } else {
      key        = String(Math.round(p.area))
      label      = `${Math.round(p.area)}㎡`
      isNamed    = false
      pyeongName = null
    }
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (!meta.has(key)) meta.set(key, { key, label, isNamed, pyeongName })
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => meta.get(key)!)
}

export function filterByTypedArea<T extends TypedAreaPoint>(points: T[], groupKey: string): T[] {
  const namedMatch = points.filter(p => p.pyeongName === groupKey)
  if (namedMatch.length > 0) return namedMatch
  const roundKey = parseInt(groupKey, 10)
  if (Number.isFinite(roundKey)) {
    return points.filter(p => !p.areaTypeId && Math.round(p.area) === roundKey)
  }
  return []
}
