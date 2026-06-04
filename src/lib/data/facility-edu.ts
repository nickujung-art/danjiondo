import type { SupabaseClient } from '@supabase/supabase-js'

export interface SchoolItem {
  school_name:  string
  school_type:  'elementary' | 'middle' | 'high'
  distance_m:   number | null
  is_assignment: boolean
}

export interface PoiItem {
  poi_name:   string
  distance_m: number | null
}

export interface HagwonStats {
  cnt500:     number   // 500m 이내
  cnt1000:    number   // 1km 이내 전체
  rawScore:   number   // 밀도 점수
  percentile: number   // 창원/김해 내 백분위 (0-100, 높을수록 좋음)
  grade:      'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D'
}

export interface FacilityEduData {
  schools:       SchoolItem[]
  hagwons:       PoiItem[]   // 학원(카카오) + 무도·도장(행안부) 통합
  daycares:      PoiItem[]
  kindergartens: PoiItem[]
  hagwonStats:   HagwonStats | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getComplexFacilityEdu(
  complexId: string,
  supabase: SupabaseClient,
): Promise<FacilityEduData> {
  const [schoolRes, poiRes, scoreRes] = await Promise.all([
    supabase
      .from('facility_school')
      .select('school_name, school_type, distance_m, is_assignment')
      .eq('complex_id', complexId)
      .order('distance_m', { ascending: true, nullsFirst: false }),

    // 학원·어린이집·무도도장 통합 조회 (sports_dojo는 예체능으로 분류)
    supabase
      .from('facility_poi')
      .select('category, poi_name, distance_m')
      .eq('complex_id', complexId)
      .in('category', ['hagwon', 'daycare', 'sports_dojo'])
      .order('distance_m', { ascending: true, nullsFirst: false }),

    supabase
      .from('complexes')
      .select('hagwon_score, si')
      .eq('id', complexId)
      .maybeSingle(),
  ])

  const schools = (schoolRes.data ?? []) as SchoolItem[]
  const allPois = poiRes.data ?? []

  // hagwon + sports_dojo → 학원·교육 탭 통합 (사용자 인식: 태권도·검도도 학원)
  const hagwons = allPois
    .filter(p => p.category === 'hagwon' || p.category === 'sports_dojo')
    .map(p => ({ poi_name: p.poi_name, distance_m: p.distance_m }))

  const isKindergarten = (name: string) =>
    name.includes('유치원') || name.includes('병설')

  const kindergartens = allPois
    .filter(p => p.category === 'daycare' && isKindergarten(p.poi_name))
    .map(p => ({ poi_name: p.poi_name, distance_m: p.distance_m }))

  const daycares = allPois
    .filter(p => p.category === 'daycare' && !isKindergarten(p.poi_name))
    .map(p => ({ poi_name: p.poi_name, distance_m: p.distance_m }))

  // 학원 통계 (hagwon_score는 카카오 학원 기준, 표시용으로만 사용)
  let hagwonStats: HagwonStats | null = null
  const complexData = scoreRes.data as { hagwon_score?: number | null; si?: string | null } | null
  const rawScore = complexData?.hagwon_score
  const si = complexData?.si
  if (rawScore != null) {
    const percentileRes = si
      ? await supabase.rpc('hagwon_score_percentile_by_si', { target_score: rawScore, p_si: si })
      : await supabase.rpc('hagwon_score_percentile', { target_score: rawScore })
    const percentile: number = (percentileRes.data as number | null) ?? 50

    hagwonStats = {
      cnt500:     hagwons.filter(h => (h.distance_m ?? 9999) <= 500).length,
      cnt1000:    hagwons.length,
      rawScore,
      percentile: Math.round(percentile * 100),
      grade:      percentile >= 0.933 ? 'A+' : percentile >= 0.867 ? 'A' : percentile >= 0.800 ? 'A-'
                : percentile >= 0.700 ? 'B+' : percentile >= 0.600 ? 'B' : percentile >= 0.500 ? 'B-'
                : percentile >= 0.400 ? 'C+' : percentile >= 0.300 ? 'C' : percentile >= 0.200 ? 'C-'
                : 'D',
    }
  } else if (hagwons.length > 0) {
    const cnt500 = hagwons.filter(h => (h.distance_m ?? 9999) <= 500).length
    const score  = cnt500 * 3 + (hagwons.length - cnt500)
    hagwonStats = {
      cnt500,
      cnt1000:    hagwons.length,
      rawScore:   score,
      percentile: 50,
      grade:      'B',
    }
  }

  return { schools, hagwons, daycares, kindergartens, hagwonStats }
}
