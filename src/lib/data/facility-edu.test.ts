import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getComplexFacilityEdu } from './facility-edu'

vi.mock('server-only', () => ({}))

function makeSupabaseMock(opts: {
  schools?: unknown[]
  pois?: unknown[]
  hagwonScore?: number | null
  si?: string | null
  qualityPercentile?: number
  districtPriceRow?: { district_avg_py: number | null; si_avg_py: number | null } | null
}) {
  const {
    schools = [],
    pois = [],
    hagwonScore = null,
    si = null,
    qualityPercentile = 0.7,
    districtPriceRow = null,
  } = opts

  const schoolQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: schools, error: null }),
  }

  const poiQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: pois, error: null }),
  }

  const scoreQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: hagwonScore != null || si != null ? { hagwon_score: hagwonScore, si } : null,
      error: null,
    }),
  }

  const rpc = vi.fn().mockImplementation((name: string) => {
    if (name === 'school_quality_percentile_by_si') {
      return Promise.resolve({ data: qualityPercentile, error: null })
    }
    if (name === 'school_district_avg_price') {
      return Promise.resolve({ data: districtPriceRow ? [districtPriceRow] : [], error: null })
    }
    // hagwon_score_percentile_by_si / hagwon_score_percentile
    return Promise.resolve({ data: 0.7, error: null })
  })

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'facility_school') return schoolQuery
    if (table === 'facility_poi') return poiQuery
    if (table === 'complexes') return scoreQuery
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, rpc } as unknown as SupabaseClient
}

describe('getComplexFacilityEdu', () => {
  // ─── POI 분류 ──────────────────────────────────────────────────────────────

  it('유치원 poi_name 포함 시 kindergartens에 분류', async () => {
    const supabase = makeSupabaseMock({
      pois: [
        { category: 'daycare', poi_name: '행복유치원', distance_m: 200 },
        { category: 'daycare', poi_name: '해달별어린이집', distance_m: 300 },
      ],
    })
    const result = await getComplexFacilityEdu('cx-1', supabase)
    expect(result.kindergartens).toHaveLength(1)
    expect(result.kindergartens.at(0)?.poi_name).toBe('행복유치원')
    expect(result.daycares).toHaveLength(1)
    expect(result.daycares.at(0)?.poi_name).toBe('해달별어린이집')
  })

  it('병설 포함 시 kindergartens에 분류', async () => {
    const supabase = makeSupabaseMock({
      pois: [
        { category: 'daycare', poi_name: '율하초등학교병설유치원', distance_m: 150 },
      ],
    })
    const result = await getComplexFacilityEdu('cx-1', supabase)
    expect(result.kindergartens).toHaveLength(1)
    expect(result.daycares).toHaveLength(0)
  })

  it('유치원 미포함 daycare는 daycares에 분류', async () => {
    const supabase = makeSupabaseMock({
      pois: [
        { category: 'daycare', poi_name: '해달별어린이집', distance_m: 300 },
        { category: 'daycare', poi_name: '웃음꽃어린이집', distance_m: 400 },
      ],
    })
    const result = await getComplexFacilityEdu('cx-1', supabase)
    expect(result.kindergartens).toHaveLength(0)
    expect(result.daycares).toHaveLength(2)
  })

  it('si 기반 hagwon_score_percentile_by_si RPC 호출됨', async () => {
    const supabase = makeSupabaseMock({ hagwonScore: 50, si: '창원시' })
    await getComplexFacilityEdu('cx-1', supabase)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(supabase.rpc).toHaveBeenCalledWith('hagwon_score_percentile_by_si', {
      target_score: 50,
      p_si: '창원시',
    })
  })

  // ─── 학교 품질 백분위 ───────────────────────────────────────────────────────

  it('students_per_class가 있는 학교에 school_quality_percentile_by_si 호출됨', async () => {
    const supabase = makeSupabaseMock({
      si: '창원시',
      qualityPercentile: 0.8,
      schools: [
        { school_name: '반송중', school_type: 'middle', distance_m: 400, is_assignment: true, students_per_class: 25.3, teachers_ratio: 18.0, advancement_rate: null, data_year: 2024 },
      ],
    })
    await getComplexFacilityEdu('cx-1', supabase)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(supabase.rpc).toHaveBeenCalledWith('school_quality_percentile_by_si', {
      p_metric:       'students_per_class',
      p_target_value: 25.3,
      p_si:           '창원시',
    })
  })

  it('students_percentile이 schools 배열에 포함됨', async () => {
    const supabase = makeSupabaseMock({
      si: '창원시',
      qualityPercentile: 0.8,
      schools: [
        { school_name: '반송중', school_type: 'middle', distance_m: 400, is_assignment: true, students_per_class: 25.3, teachers_ratio: 18.0, advancement_rate: null, data_year: 2024 },
      ],
    })
    const result = await getComplexFacilityEdu('cx-1', supabase)
    expect(result.schools).toHaveLength(1)
    expect(result.schools[0]!.students_percentile).toBe(0.8)
    expect(result.schools[0]!.advancement_percentile).toBeNull()
  })

  it('students_per_class가 null인 학교는 백분위 RPC 미호출, students_percentile=null', async () => {
    const supabase = makeSupabaseMock({
      si: '창원시',
      schools: [
        { school_name: '진해고', school_type: 'high', distance_m: 600, is_assignment: false, students_per_class: null, teachers_ratio: null, advancement_rate: null, data_year: null },
      ],
    })
    const result = await getComplexFacilityEdu('cx-1', supabase)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(supabase.rpc).not.toHaveBeenCalledWith('school_quality_percentile_by_si', expect.anything())
    expect(result.schools[0]!.students_percentile).toBeNull()
  })

  it('si가 null이면 백분위 RPC 미호출', async () => {
    const supabase = makeSupabaseMock({
      si: null,
      schools: [
        { school_name: '반송중', school_type: 'middle', distance_m: 400, is_assignment: true, students_per_class: 25.3, teachers_ratio: 18.0, advancement_rate: null, data_year: 2024 },
      ],
    })
    const result = await getComplexFacilityEdu('cx-1', supabase)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(supabase.rpc).not.toHaveBeenCalledWith('school_quality_percentile_by_si', expect.anything())
    expect(result.schools[0]!.students_percentile).toBeNull()
  })

  // ─── 배정학교 학군 평당가 비교 (P2) ────────────────────────────────────────

  it('배정학교에 school_district_avg_price RPC 호출됨', async () => {
    const supabase = makeSupabaseMock({
      schools: [
        { school_name: '반송중', school_type: 'middle', distance_m: 400, is_assignment: true, students_per_class: null, teachers_ratio: null, advancement_rate: null, data_year: null },
        { school_name: '반송초', school_type: 'elementary', distance_m: 300, is_assignment: false, students_per_class: null, teachers_ratio: null, advancement_rate: null, data_year: null },
      ],
    })
    await getComplexFacilityEdu('cx-1', supabase)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(supabase.rpc).toHaveBeenCalledWith('school_district_avg_price', { p_school_name: '반송중', p_months: 12 })
    // 비배정학교는 호출 안됨
    expect(supabase.rpc).not.toHaveBeenCalledWith('school_district_avg_price', { p_school_name: '반송초', p_months: 12 })
  })

  it('price_premium 계산: (district - si) / si * 100 반올림', async () => {
    const supabase = makeSupabaseMock({
      districtPriceRow: { district_avg_py: 1500, si_avg_py: 1000 },
      schools: [
        { school_name: '반송중', school_type: 'middle', distance_m: 400, is_assignment: true, students_per_class: null, teachers_ratio: null, advancement_rate: null, data_year: null },
      ],
    })
    const result = await getComplexFacilityEdu('cx-1', supabase)
    // (1500 - 1000) / 1000 * 100 = 50
    expect(result.schools[0]!.price_premium).toBe(50)
    expect(result.schools[0]!.district_avg_py).toBe(1500)
    expect(result.schools[0]!.si_avg_py).toBe(1000)
  })

  it('district_avg_py가 null이면 price_premium=null', async () => {
    const supabase = makeSupabaseMock({
      districtPriceRow: { district_avg_py: null, si_avg_py: 1000 },
      schools: [
        { school_name: '반송중', school_type: 'middle', distance_m: 400, is_assignment: true, students_per_class: null, teachers_ratio: null, advancement_rate: null, data_year: null },
      ],
    })
    const result = await getComplexFacilityEdu('cx-1', supabase)
    expect(result.schools[0]!.price_premium).toBeNull()
  })
})
