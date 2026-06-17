// src/services/naver-land.test.ts
import { describe, it, expect } from 'vitest'
import { parsePrcInfo, normalizeComplexName, haversineDistanceM } from './naver-land'

describe('parsePrcInfo', () => {
  it('억+만원 조합 파싱', () => {
    expect(parsePrcInfo('5억 3,000')).toBe(53000)
  })
  it('억만 파싱', () => {
    expect(parsePrcInfo('3억')).toBe(30000)
  })
  it('만원만 파싱', () => {
    expect(parsePrcInfo('9,800')).toBe(9800)
  })
  it('빈 문자열 → null', () => {
    expect(parsePrcInfo('')).toBeNull()
  })
  it('알 수 없는 형식 → null', () => {
    expect(parsePrcInfo('abc만원')).toBeNull()
  })
})

describe('normalizeComplexName', () => {
  it('아파트 접미사 제거', () => {
    expect(normalizeComplexName('래미안창원성산아파트')).toBe('래미안창원성산')
  })
  it('시명 제거', () => {
    expect(normalizeComplexName('창원센트럴자이')).toBe('센트럴자이')
  })
  it('단지 번호 공백 제거', () => {
    expect(normalizeComplexName('래미안창원성산 1단지')).toBe('래미안창원성산1단지')
  })
})

describe('haversineDistanceM', () => {
  it('동일 좌표 → 0', () => {
    expect(haversineDistanceM({ lat: 35.22, lng: 128.68 }, { lat: 35.22, lng: 128.68 })).toBe(0)
  })
  it('200m 이격 좌표 → 250m 미만', () => {
    // 경도 0.002도 ≈ 약 180m (35도 위도 기준)
    const dist = haversineDistanceM({ lat: 35.22, lng: 128.68 }, { lat: 35.22, lng: 128.682 })
    expect(dist).toBeLessThan(250)
    expect(dist).toBeGreaterThan(100)
  })
})
