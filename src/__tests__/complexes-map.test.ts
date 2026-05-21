/**
 * Step6 수용 기준 테스트 — 지도용 단지 데이터 레이어
 *
 * - getComplexesForMap: 좌표 있는 단지만, 최소 필드
 * - clusterComplexes: 순수 함수, 줌레벨별 클러스터 반환
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { URL_, AKEY, SKEY, admin } from './helpers/db'

vi.mock('server-only', () => ({}))

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', URL_)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', AKEY)
})

// ── 픽스처 ──────────────────────────────────────────────────
let withCoordId: string
let noCoordId: string

beforeAll(async () => {
  if (!SKEY) return
  const { data: a } = await admin.from('complexes').insert({
    canonical_name: '지도테스트좌표있음', name_normalized: '지도테스트좌표있음',
    sgg_code: '48121', status: 'active',
    lat: 35.2286, lng: 128.6816,
  }).select('id').single()
  withCoordId = (a as { id: string }).id

  const { data: b } = await admin.from('complexes').insert({
    canonical_name: '지도테스트좌표없음', name_normalized: '지도테스트좌표없음',
    sgg_code: '48121', status: 'active',
    // lat/lng null
  }).select('id').single()
  noCoordId = (b as { id: string }).id
})

afterAll(async () => {
  if (!SKEY) return
  await admin.from('complexes').delete().in('id', [withCoordId, noCoordId])
})

// ── getComplexesForMap ──────────────────────────────────────
import { getComplexesForMap } from '@/lib/data/complexes-map'

describe.skipIf(!SKEY)('getComplexesForMap', () => {
  it('좌표 있는 단지만 반환', async () => {
    const items = await getComplexesForMap(['48121'], admin)
    const ids = items.map((c) => c.id)
    expect(ids).toContain(withCoordId)
    expect(ids).not.toContain(noCoordId)
  })

  it('반환 필드: id, canonical_name, lat, lng, sgg_code', async () => {
    const items = await getComplexesForMap(['48121'], admin)
    const item = items.find((c) => c.id === withCoordId)
    expect(item).toBeDefined()
    expect(item!.lat).toBeCloseTo(35.2286, 3)
    expect(item!.lng).toBeCloseTo(128.6816, 3)
    expect(item!.canonical_name).toBe('지도테스트좌표있음')
    expect(item!.sgg_code).toBe('48121')
  })

  it('sgg_code 필터 — 매칭 없으면 결과에서 제외', async () => {
    const items = await getComplexesForMap(['99999'], admin)
    const ids = items.map((c) => c.id)
    expect(ids).not.toContain(withCoordId)
  })

  it('빈 sgg_code 배열 → 빈 배열', async () => {
    const items = await getComplexesForMap([], admin)
    expect(items).toEqual([])
  })
})

// ── clusterComplexes (순수 함수) ────────────────────────────
import { clusterComplexes } from '@/lib/data/complexes-map'

describe('clusterComplexes', () => {
  const BASE_COMPLEX = {
    avg_sale_per_pyeong: null,
    view_count:          0,
    price_change_30d:    null,
    tx_count_30d:        0,
    is_new_record_30d:   false,
    status:              'active',
    built_year:          null,
    household_count:     null,
    hagwon_grade:        null,
    // Phase 12 추가 필드
    si:                  null,
    gu:                  null,
    dong:                null,
    recent_price:        null,
    recent_date:         null,
    recent_area_m2:      null,
  }

  const complexes = [
    { id: 'a', canonical_name: '아파트A', lat: 35.2286, lng: 128.6816, sgg_code: '48121', ...BASE_COMPLEX },
    { id: 'b', canonical_name: '아파트B', lat: 35.2287, lng: 128.6817, sgg_code: '48121', ...BASE_COMPLEX }, // A에서 ~13m
    { id: 'c', canonical_name: '아파트C', lat: 35.2500, lng: 128.7000, sgg_code: '48121', ...BASE_COMPLEX }, // 멀리 있음
  ]

  const BOUNDS: [number, number, number, number] = [128.5, 35.1, 128.9, 35.4]

  it('줌 낮으면 (zoom=5) A+B 클러스터 합쳐짐', () => {
    const result = clusterComplexes(complexes, BOUNDS, 5)
    const clusters = result.filter((f) => f.properties.cluster)
    expect(clusters.length).toBeGreaterThan(0)
  })

  it('줌 높으면 (zoom=17) 개별 마커로 분리', () => {
    const result = clusterComplexes(complexes, BOUNDS, 17)
    const points = result.filter((f) => !f.properties.cluster)
    expect(points.length).toBe(3)
  })

  it('빈 배열 → 빈 결과', () => {
    const result = clusterComplexes([], BOUNDS, 10)
    expect(result).toEqual([])
  })
})
