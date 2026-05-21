import type { SupabaseClient } from '@supabase/supabase-js'
import Supercluster from 'supercluster'

export interface ComplexMapItem {
  id:                  string
  canonical_name:      string
  lat:                 number
  lng:                 number
  sgg_code:            string
  // Phase 11 추가
  avg_sale_per_pyeong: number | null
  view_count:          number
  price_change_30d:    number | null
  tx_count_30d:        number
  status:              string
  built_year:          number | null
  household_count:     number | null
  hagwon_grade:        string | null
  is_new_record_30d: boolean
  // Phase 12 추가 — hover 툴팁 + DongClusterChip
  si:              string | null
  gu:              string | null
  dong:            string | null
  recent_price:    number | null  // 만원 단위 — 최근 6개월 이내 거래 1건
  recent_date:     string | null  // 'YYYY-MM-DD'
  recent_area_m2:  number | null  // m² 단위
}

// hagwon_score 0-1 백분위 → 등급 문자열 변환 (facility-edu.ts와 동일 임계값)
function percentileToGrade(percentile: number | null): string | null {
  if (percentile === null) return null
  if (percentile >= 0.933) return 'A+'
  if (percentile >= 0.867) return 'A'
  if (percentile >= 0.800) return 'A-'
  if (percentile >= 0.700) return 'B+'
  if (percentile >= 0.600) return 'B'
  if (percentile >= 0.500) return 'B-'
  if (percentile >= 0.400) return 'C+'
  if (percentile >= 0.300) return 'C'
  if (percentile >= 0.200) return 'C-'
  return 'D'
}

export async function getComplexesForMap(
  sggCodes: string[],
  supabase: SupabaseClient,
): Promise<ComplexMapItem[]> {
  if (sggCodes.length === 0) return []

  // 스텝 1: complexes 기본 정보 조회 (Phase 12: si/gu/dong 추가)
  const { data, error } = await supabase
    .from('complexes')
    .select(
      `id, canonical_name, lat, lng, sgg_code,
       avg_sale_per_pyeong, view_count, price_change_30d, tx_count_30d,
       is_new_record_30d, status, built_year, household_count, hagwon_score,
       si, gu, dong`,
    )
    .in('sgg_code', sggCodes)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .not('status', 'in', '(demolished,merged,rental)')
    // 창원·김해 유효 좌표 범위 — 잘못된 지오코딩 결과 제외
    .gte('lat', 34.8).lte('lat', 35.6)
    .gte('lng', 128.3).lte('lng', 129.1)
    // 소규모 오피스텔 제외: 거래 없고 세대수 100 미만인 오피스텔 숨김
    .or('building_type.neq.officetel,tx_count_30d.gt.0,household_count.gte.100')
    .range(0, 9999)

  if (error) throw new Error(`getComplexesForMap failed: ${error.message}`)

  const rows = (data ?? []) as Array<{
    id:                  string
    canonical_name:      string
    lat:                 number
    lng:                 number
    sgg_code:            string
    avg_sale_per_pyeong: number | null
    view_count:          number
    price_change_30d:    number | null
    tx_count_30d:        number
    is_new_record_30d:   boolean
    status:              string
    built_year:          number | null
    household_count:     number | null
    hagwon_score:        number | null
    si:                  string | null
    gu:                  string | null
    dong:                string | null
  }>

  if (rows.length === 0) return []

  // hagwon_score (raw 정수) → 백분위(0-1) → 등급 변환
  // 로드된 단지들의 분포에서 경험적 백분위 계산 (전수 DB 쿼리 없이)
  const hagwonScores = rows
    .map(r => r.hagwon_score)
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b)

  function hagwonGrade(score: number | null): string | null {
    if (score === null || hagwonScores.length === 0) return null
    const below = hagwonScores.filter(s => s < score).length
    return percentileToGrade(below / hagwonScores.length)
  }

  // 스텝 2: 최근 12개월 단지별 최신 거래 1건 조회
  // DISTINCT ON RPC 사용 — PostgREST 기본 1,000행 제한 우회 + 서버에서 필터링
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const sinceDateStr = twelveMonthsAgo.toISOString().slice(0, 10)

  const ids = rows.map((r) => r.id)

  const { data: txData } = await supabase
    .rpc('get_recent_complex_sales', {
      p_complex_ids: ids,
      p_since:       sinceDateStr,
    })

  // 스텝 3: RPC가 DISTINCT ON으로 단지별 1건만 반환하므로 그대로 Map화
  const recentTxMap = new Map<string, { price: number; deal_date: string; area_m2: number }>()
  for (const tx of (txData ?? []) as Array<{
    complex_id: string
    price: number
    deal_date: string
    area_m2: number
  }>) {
    recentTxMap.set(tx.complex_id, {
      price:     tx.price,
      deal_date: tx.deal_date,
      area_m2:   tx.area_m2,
    })
  }

  const mapped = rows.map((r) => {
    const tx = recentTxMap.get(r.id)
    return {
      id:                  r.id,
      canonical_name:      r.canonical_name,
      lat:                 r.lat,
      lng:                 r.lng,
      sgg_code:            r.sgg_code,
      avg_sale_per_pyeong: r.avg_sale_per_pyeong ?? null,
      view_count:          r.view_count ?? 0,
      price_change_30d:    r.price_change_30d ?? null,
      tx_count_30d:        r.tx_count_30d ?? 0,
      is_new_record_30d:   r.is_new_record_30d ?? false,
      status:              r.status ?? 'active',
      built_year:          r.built_year ?? null,
      household_count:     r.household_count ?? null,
      hagwon_grade:        hagwonGrade(r.hagwon_score ?? null),
      si:                  r.si ?? null,
      gu:                  r.gu ?? null,
      dong:                r.dong ?? null,
      recent_price:        tx?.price ?? null,
      recent_date:         tx?.deal_date ?? null,
      recent_area_m2:      tx ? Number(tx.area_m2) : null,
    } satisfies ComplexMapItem
  })

  // 동일 좌표 중복 단지 제거 — tx_count > view_count > household_count 순 우선
  const coordMap = new Map<string, ComplexMapItem>()
  for (const c of mapped) {
    const key = `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`
    const existing = coordMap.get(key)
    if (!existing) {
      coordMap.set(key, c)
    } else {
      const scoreNew = c.tx_count_30d * 1000 + c.view_count * 10 + (c.household_count ?? 0)
      const scoreOld = existing.tx_count_30d * 1000 + existing.view_count * 10 + (existing.household_count ?? 0)
      if (scoreNew > scoreOld) coordMap.set(key, c)
    }
  }
  return Array.from(coordMap.values())
}

// ── supercluster 래퍼 ──────────────────────────────────────

export type ClusterFeature = ReturnType<Supercluster['getClusters']>[number]

export function buildClusterIndex(complexes: ComplexMapItem[]) {
  const index = new Supercluster({ radius: 60, maxZoom: 12 })
  index.load(
    complexes.map((c) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
      properties: {
        id:                  c.id,
        name:                c.canonical_name,
        cluster:             false,
        avg_sale_per_pyeong: c.avg_sale_per_pyeong,
        view_count:          c.view_count,
        price_change_30d:    c.price_change_30d,
        tx_count_30d:        c.tx_count_30d,
        is_new_record_30d:   c.is_new_record_30d,
        status:              c.status,
        built_year:          c.built_year,
        household_count:     c.household_count,
        hagwon_grade:        c.hagwon_grade,
        // Phase 12 추가 — DongClusterChip/hover 툴팁
        si:                  c.si,
        gu:                  c.gu,
        dong:                c.dong,
        recent_price:        c.recent_price,
        recent_date:         c.recent_date,
        recent_area_m2:      c.recent_area_m2,
      },
    })),
  )
  return index
}

export function clusterComplexes(
  complexes: ComplexMapItem[],
  bounds: [number, number, number, number],  // [westLng, southLat, eastLng, northLat]
  zoom: number,
): ClusterFeature[] {
  if (complexes.length === 0) return []
  return buildClusterIndex(complexes).getClusters(bounds, zoom)
}
