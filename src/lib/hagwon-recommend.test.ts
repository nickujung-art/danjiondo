import { describe, it, expect } from 'vitest'
import {
  haversine,
  locationScore,
  qualityScore,
  individualScore,
  selectBestCombo,
  type RawCandidate,
} from '@/lib/hagwon-route'

// 창원 기준 좌표
const HOME_LAT = 35.228
const HOME_LNG = 128.681

function makeCandidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    id:               'test-id',
    name:             '테스트학원',
    address:          null,
    hagwon_lat:       HOME_LAT + 0.005,
    hagwon_lng:       HOME_LNG,
    realm_sc_nm:      null,
    le_crse_nm:       null,
    fee_tier:         'standard',
    popularity_score: 0.6,
    age_groups:       ['초등저'],
    subject_category: 'math',
    dist_home:        500,
    blog_tags:        [],
    blog_snippet:     null,
    naver_blog_count: 0,
    ...overrides,
  }
}

describe('haversine', () => {
  it('같은 지점은 0m', () => {
    expect(haversine(35.2, 128.6, 35.2, 128.6)).toBeCloseTo(0, 1)
  })
  it('1도 위도 차 ≈ 111km', () => {
    expect(haversine(35, 128, 36, 128)).toBeGreaterThan(110000)
    expect(haversine(35, 128, 36, 128)).toBeLessThan(112000)
  })
})

describe('locationScore (학교 미선택)', () => {
  it('집 바로 옆 학원 → 1.0 근접', () => {
    const score = locationScore(HOME_LAT, HOME_LNG, HOME_LAT, HOME_LNG)
    expect(score).toBeCloseTo(1.0, 1)
  })
  it('2km 이상 떨어진 학원 → 0', () => {
    const farLat = HOME_LAT + 0.02
    const score = locationScore(HOME_LAT, HOME_LNG, farLat, HOME_LNG)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(0.3)
  })
})

describe('locationScore (학교 선택)', () => {
  it('집-학교 경로 정중간 학원 → 높은 점수', () => {
    const schoolLat = HOME_LAT + 0.01
    const schoolLng = HOME_LNG
    const hagwonLat = HOME_LAT + 0.005  // 집-학교 중간
    const score = locationScore(HOME_LAT, HOME_LNG, hagwonLat, HOME_LNG, schoolLat, schoolLng)
    expect(score).toBeGreaterThan(0.6)
  })
  it('경로에서 크게 벗어난 학원 → 낮은 점수', () => {
    const schoolLat = HOME_LAT + 0.01
    const schoolLng = HOME_LNG
    const hagwonLat = HOME_LAT + 0.02    // 학교보다 훨씬 더 멀리
    const hagwonLng = HOME_LNG + 0.02
    const score = locationScore(HOME_LAT, HOME_LNG, hagwonLat, hagwonLng, schoolLat, schoolLng)
    expect(score).toBeLessThan(0.5)
  })
})

describe('qualityScore', () => {
  it('수강료 일치 + 인기도 1.0 → 높은 점수', () => {
    const score = qualityScore(1.0, 'standard', ['standard'], ['초등저'], '초등저')
    expect(score).toBeGreaterThan(0.85)
  })
  it('수강료 불일치 → 점수 하락', () => {
    const match    = qualityScore(0.5, 'standard', ['standard'], ['초등저'], '초등저')
    const mismatch = qualityScore(0.5, 'premium', ['standard'], ['초등저'], '초등저')
    expect(match).toBeGreaterThan(mismatch)
  })
  it('수강료 미선택(빈 배열) → 중간 점수', () => {
    const score = qualityScore(0.5, 'premium', [], [], undefined)
    expect(score).toBeGreaterThan(0.2)
    expect(score).toBeLessThan(0.9)
  })
  it('나이 불일치 → 감점', () => {
    const match    = qualityScore(0.5, null, [], ['초등저'], '초등저')
    const mismatch = qualityScore(0.5, null, [], ['고등'],   '초등저')
    expect(match).toBeGreaterThan(mismatch)
  })
})

describe('individualScore', () => {
  it('가깝고 인기도 높은 학원이 멀고 인기도 낮은 학원보다 높은 점수', () => {
    const near = makeCandidate({ hagwon_lat: HOME_LAT + 0.001, popularity_score: 0.9, dist_home: 100 })
    const far  = makeCandidate({ hagwon_lat: HOME_LAT + 0.02,  popularity_score: 0.1, dist_home: 2000 })
    const sNear = individualScore(near, HOME_LAT, HOME_LNG, [], '초등저')
    const sFar  = individualScore(far,  HOME_LAT, HOME_LNG, [], '초등저')
    expect(sNear).toBeGreaterThan(sFar)
  })
})

describe('selectBestCombo', () => {
  it('단일 과목 → 방문 순서 1개 반환', () => {
    const candidate = {
      ...makeCandidate(),
      subject: 'math' as const,
      individual_score: 0.8,
    }
    const combo = selectBestCombo([[candidate]], HOME_LAT, HOME_LNG)
    expect(combo.hagwons).toHaveLength(1)
    expect(combo.visitOrder).toHaveLength(1)
    expect(combo.totalRouteDist).toBeGreaterThan(0)
  })
  it('루트: 집으로 시작하고 집으로 끝남', () => {
    const candidate = {
      ...makeCandidate(),
      subject: 'english' as const,
      individual_score: 0.7,
    }
    const combo = selectBestCombo([[candidate]], HOME_LAT, HOME_LNG)
    expect(combo.route[0]?.label).toBe('집')
    expect(combo.route[combo.route.length - 1]?.label).toBe('집')
  })
  it('학교 선택 시 루트에 학교가 포함됨', () => {
    const candidate = {
      ...makeCandidate(),
      subject: 'math' as const,
      individual_score: 0.8,
    }
    const schoolLat = HOME_LAT + 0.008
    const combo = selectBestCombo([[candidate]], HOME_LAT, HOME_LNG, schoolLat, HOME_LNG, '창원초등학교')
    expect(combo.route.some(s => s.label === '창원초등학교')).toBe(true)
  })
})
