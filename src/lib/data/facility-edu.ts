import type { SupabaseClient } from '@supabase/supabase-js'

export interface SchoolItem {
  school_name:            string
  school_type:            'elementary' | 'middle' | 'high'
  distance_m:             number | null
  is_assignment:          boolean
  // 학교알리미 품질 지표 (null = 데이터 미수집)
  students_per_class:     number | null
  teachers_ratio:         number | null
  advancement_rate:       number | null   // 특목고 진학률 % (중학교)
  data_year:              number | null
  // 창원/김해 내 백분위 (0.0~1.0, RPC 계산)
  students_percentile:    number | null   // 높을수록 학급당학생수 적음(좋음)
  advancement_percentile: number | null   // 높을수록 진학률 높음(좋음)
  // 학군 평당가 비교 (P2, 배정학교 전용)
  district_avg_py:        number | null
  si_avg_py:              number | null
  price_premium:          number | null   // (district - si) / si * 100
}

export interface PoiItem {
  poi_name:   string
  distance_m: number | null
}

export interface HagwonStats {
  cnt500:     number
  cnt1000:    number
  rawScore:   number
  percentile: number
  grade:      'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D'
}

export interface FacilityEduData {
  schools:       SchoolItem[]
  hagwons:       PoiItem[]
  daycares:      PoiItem[]
  kindergartens: PoiItem[]
  hagwonStats:   HagwonStats | null
  si:            string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getComplexFacilityEdu(
  complexId: string,
  supabase: SupabaseClient,
): Promise<FacilityEduData> {
  const [schoolRes, poiRes, scoreRes] = await Promise.all([
    supabase
      .from('facility_school')
      .select('school_name, school_type, distance_m, is_assignment, students_per_class, teachers_ratio, advancement_rate, data_year')
      .eq('complex_id', complexId)
      .order('distance_m', { ascending: true, nullsFirst: false }),

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

  const complexData = scoreRes.data as { hagwon_score?: number | null; si?: string | null } | null
  const rawScore = complexData?.hagwon_score
  const si = complexData?.si ?? null

  // ─── 학교 품질 백분위 계산 ────────────────────────────────────────────────
  const rawSchools = (schoolRes.data ?? []) as Array<{
    school_name: string
    school_type: string
    distance_m: number | null
    is_assignment: boolean
    students_per_class: number | null
    teachers_ratio: number | null
    advancement_rate: number | null
    data_year: number | null
  }>

  // 백분위 RPC는 si가 있고 데이터가 있는 학교만 (상위 5개 배정학교 대상)
  const schoolsWithData = si
    ? rawSchools.filter(s => s.students_per_class != null || s.advancement_rate != null).slice(0, 5)
    : []

  const percentileResults = await Promise.all(
    schoolsWithData.map(async s => {
      const [studentsPct, advancementPct] = await Promise.all([
        s.students_per_class != null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (supabase as any).rpc('school_quality_percentile_by_si', {
              p_metric:       'students_per_class',
              p_target_value: s.students_per_class,
              p_si:           si,
            }).then((r: { data: number | null }) => r.data as number | null)
          : Promise.resolve(null),

        s.school_type === 'middle' && s.advancement_rate != null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (supabase as any).rpc('school_quality_percentile_by_si', {
              p_metric:       'advancement_rate',
              p_target_value: s.advancement_rate,
              p_si:           si,
            }).then((r: { data: number | null }) => r.data as number | null)
          : Promise.resolve(null),
      ])
      return { school_name: s.school_name, studentsPct, advancementPct }
    })
  )

  const pctMap = new Map(
    percentileResults.map(r => [r.school_name, r])
  )

  // ─── 배정학교 학군 평당가 비교 (P2) ──────────────────────────────────────
  const assignedSchools = rawSchools.filter(s => s.is_assignment)
  const priceResults = await Promise.all(
    assignedSchools.map(async s => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc('school_district_avg_price', {
        p_school_name: s.school_name,
        p_months:      12,
      })
      const row = data?.[0] as { district_avg_py: number | null; si_avg_py: number | null } | undefined
      const dpy = row?.district_avg_py ? Number(row.district_avg_py) : null
      const spy = row?.si_avg_py       ? Number(row.si_avg_py)       : null
      if (!dpy || !spy) return { school_name: s.school_name, district_avg_py: null, si_avg_py: null, price_premium: null }
      const premium = Math.round((dpy - spy) / spy * 100)
      return {
        school_name:     s.school_name,
        district_avg_py: dpy,
        si_avg_py:       spy,
        price_premium:   premium,
      }
    })
  )
  const priceMap = new Map(priceResults.map(r => [r.school_name, r]))

  // ─── SchoolItem 조립 ──────────────────────────────────────────────────────
  const schools: SchoolItem[] = rawSchools.map(s => {
    const pct   = pctMap.get(s.school_name)
    const price = priceMap.get(s.school_name)
    return {
      school_name:            s.school_name,
      school_type:            s.school_type as SchoolItem['school_type'],
      distance_m:             s.distance_m,
      is_assignment:          s.is_assignment,
      students_per_class:     s.students_per_class,
      teachers_ratio:         s.teachers_ratio,
      advancement_rate:       s.advancement_rate,
      data_year:              s.data_year,
      students_percentile:    pct?.studentsPct ?? null,
      advancement_percentile: pct?.advancementPct ?? null,
      district_avg_py:        price?.district_avg_py ?? null,
      si_avg_py:              price?.si_avg_py ?? null,
      price_premium:          price?.price_premium ?? null,
    }
  })

  // ─── POI 분류 ─────────────────────────────────────────────────────────────
  const allPois = poiRes.data ?? []

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

  // ─── 학원 통계 ────────────────────────────────────────────────────────────
  let hagwonStats: HagwonStats | null = null
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

  return { schools, hagwons, daycares, kindergartens, hagwonStats, si }
}
