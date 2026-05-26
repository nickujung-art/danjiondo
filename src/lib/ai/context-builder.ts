import type { RawTransaction } from '@/lib/data/complex-detail'
import type { ManagementCostRow } from '@/lib/data/management-cost'
import type { FacilityEduData } from '@/lib/data/facility-edu'
import type { QuadrantData } from '@/lib/data/quadrant'
import type { ReviewStats } from '@/lib/data/reviews'
import type { ReviewWithComments } from '@/lib/data/comments'

interface ComplexBasic {
  canonical_name: string
  si: string | null
  gu: string | null
  dong: string | null
  built_year: number | null
  household_count: number | null
  floors_above: number | null
  heat_type: string | null
  road_address: string | null
}

interface FacilityKapt {
  parking_count?: number | null
  management_cost_m2?: number | null
  elevator_count?: number | null
  building_count?: number | null
  management_type?: string | null
}

interface DistrictStats {
  adm_nm?: string | null
  population?: number | null
  pop_30s?: number | null
  pop_40s?: number | null
}

export interface ComplexContextInput {
  complex: ComplexBasic
  rawSaleData: RawTransaction[]
  rawJeonseData: RawTransaction[]
  facilityKapt: FacilityKapt | null
  managementCostRows: ManagementCostRow[]
  facilityEdu: FacilityEduData
  quadrantData: QuadrantData | null
  districtStats: DistrictStats | null
  reviewStats: ReviewStats
  reviews: ReviewWithComments[]
}

function fmtPrice(n: number): string {
  const uk = Math.floor(n / 10000)
  const man = n % 10000
  if (uk > 0 && man > 0) return `${uk}억 ${man.toLocaleString()}만`
  if (uk > 0) return `${uk}억`
  return `${n.toLocaleString()}만`
}

function txFlowLines(txs: RawTransaction[], months: number): string {
  if (txs.length === 0) return '데이터 없음'
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().slice(0, 7)
  const byMonth = new Map<string, number[]>()
  for (const t of txs.filter(t => t.yearMonth >= cutoffStr)) {
    const arr = byMonth.get(t.yearMonth) ?? []
    arr.push(t.price)
    byMonth.set(t.yearMonth, arr)
  }
  if (byMonth.size === 0) return '해당 기간 거래 없음'
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([ym, prices]) => {
      const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
      return `${ym} ${prices.length}건 평균${fmtPrice(avg)}`
    })
    .join(' / ')
}

export function buildComplexContext(input: ComplexContextInput): string {
  const {
    complex, rawSaleData, rawJeonseData, facilityKapt,
    managementCostRows, facilityEdu, quadrantData, districtStats,
    reviewStats, reviews,
  } = input
  const sections: string[] = []

  // ── 기본정보 ─────────────────────────────────────
  const loc = [complex.si, complex.gu, complex.dong].filter(Boolean).join(' ')
  sections.push([
    '[단지 기본정보]',
    [
      `이름: ${complex.canonical_name}`,
      `위치: ${loc || complex.road_address || '-'}`,
      complex.built_year    ? `준공: ${complex.built_year}년`                              : null,
      complex.household_count ? `세대수: ${complex.household_count.toLocaleString()}세대`  : null,
      complex.floors_above  ? `최고층: ${complex.floors_above}층`                          : null,
      complex.heat_type     ? `난방: ${complex.heat_type}`                                  : null,
    ].filter(Boolean).join(' | '),
  ].join('\n'))

  // ── 실거래가 흐름 ─────────────────────────────────
  sections.push(`[실거래가 흐름 - 매매 최근12개월]\n${txFlowLines(rawSaleData, 12)}`)
  if (rawJeonseData.length > 0) {
    sections.push(`[실거래가 흐름 - 전세 최근12개월]\n${txFlowLines(rawJeonseData, 12)}`)
  }

  // ── 시설 ─────────────────────────────────────────
  if (facilityKapt) {
    const parts = [
      facilityKapt.parking_count != null
        ? `주차: 총${facilityKapt.parking_count.toLocaleString()}면${complex.household_count ? `(세대당${(facilityKapt.parking_count / complex.household_count).toFixed(1)}대)` : ''}` : null,
      facilityKapt.elevator_count != null
        ? `엘리베이터: 총${facilityKapt.elevator_count}대${facilityKapt.building_count ? `(${facilityKapt.building_count}동)` : ''}` : null,
      facilityKapt.management_cost_m2 != null
        ? `관리비(m²당): ${facilityKapt.management_cost_m2.toLocaleString()}원` : null,
      facilityKapt.management_type ? `관리방식: ${facilityKapt.management_type}` : null,
    ].filter(Boolean).join(' | ')
    if (parts) sections.push(`[시설]\n${parts}`)
  }

  // ── 관리비 ───────────────────────────────────────
  if (managementCostRows.length > 0) {
    const lines = managementCostRows.slice(0, 3).map(r => {
      const total = (r.common_cost_total ?? 0) + (r.individual_cost_total ?? 0)
      const parts = [
        r.common_cost_total ? `공용${r.common_cost_total.toLocaleString()}만` : null,
        r.individual_cost_total ? `개별${r.individual_cost_total.toLocaleString()}만` : null,
      ].filter(Boolean).join('+')
      return `${r.year_month.slice(0, 7)}: ${parts} 합계${total.toLocaleString()}만원`
    }).join(' / ')
    sections.push(`[관리비 최근3개월]\n${lines}`)
  }

  // ── 교육환경 ─────────────────────────────────────
  const eduLines: string[] = []
  const assigned = facilityEdu.schools.filter(s => s.is_assignment)
  const nearby   = facilityEdu.schools.filter(s => !s.is_assignment)
  if (assigned.length > 0) {
    eduLines.push(`배정학교: ${assigned.map(s =>
      `${s.school_name}(${s.school_type === 'elementary' ? '초' : s.school_type === 'middle' ? '중' : '고'}${s.distance_m ? ` ${Math.round(s.distance_m)}m` : ''})`
    ).join(' ')}`)
  }
  if (nearby.length > 0) {
    eduLines.push(`인근학교: ${nearby.slice(0, 4).map(s =>
      `${s.school_name}(${s.distance_m ? `${Math.round(s.distance_m)}m` : '-'})`
    ).join(' ')}`)
  }
  if (facilityEdu.hagwonStats) {
    const h = facilityEdu.hagwonStats
    eduLines.push(`학원: 500m내 ${h.cnt500}곳 / 1km내 ${h.cnt1000}곳 / 밀도등급 ${h.grade}`)
  }
  if (eduLines.length > 0) sections.push(`[교육환경]\n${eduLines.join('\n')}`)

  // ── 가성비 분석 ──────────────────────────────────
  if (quadrantData) {
    const target = quadrantData.points.find(p => p.isTarget)
    if (target) {
      const xDiff = target.x - quadrantData.medianX
      const yDiff = target.y - quadrantData.medianY
      const quadrant = xDiff >= 0 && yDiff >= 0 ? '고가격·고전세가율'
        : xDiff <  0 && yDiff >= 0 ? '저가격·고전세가율(가성비우수)'
        : xDiff <  0 && yDiff <  0 ? '저가격·저전세가율'
        : '고가격·저전세가율'
      sections.push(
        `[가성비 분석 - ${quadrantData.regionLabel} ${quadrantData.totalCount}개 단지 비교]\n` +
        `평당가: ${Math.round(target.x).toLocaleString()}만원 | 전세가율: ${Math.round(target.y)}% | ` +
        `지역중간값(평당가: ${Math.round(quadrantData.medianX).toLocaleString()}만원 전세가율: ${Math.round(quadrantData.medianY)}%) | ` +
        `포지션: ${quadrant}`,
      )
    }
  }

  // ── 지역 통계 ────────────────────────────────────
  if (districtStats) {
    const parts = [
      districtStats.adm_nm  ? `지역: ${districtStats.adm_nm}`                          : null,
      districtStats.population ? `인구: ${districtStats.population.toLocaleString()}명` : null,
      districtStats.pop_30s != null && districtStats.population
        ? `30대: ${Math.round(districtStats.pop_30s / districtStats.population * 100)}%` : null,
      districtStats.pop_40s != null && districtStats.population
        ? `40대: ${Math.round(districtStats.pop_40s / districtStats.population * 100)}%` : null,
    ].filter(Boolean).join(' | ')
    if (parts) sections.push(`[지역 통계]\n${parts}`)
  }

  // ── 동네 의견 ────────────────────────────────────
  if (reviewStats.count > 0) {
    const snippets = reviews
      .filter(r => r.content && r.content.length > 10)
      .slice(0, 5)
      .map(r => `"${r.content!.slice(0, 60)}"`)
      .join(' ')
    sections.push(
      `[동네 의견]\n${reviewStats.count}건 평균${reviewStats.avg_rating?.toFixed(1) ?? '-'}점. ${snippets}`,
    )
  }

  return sections.join('\n\n')
}
