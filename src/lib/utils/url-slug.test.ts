/**
 * url-slug 유틸리티 테스트 — buildUrlSlug, classifySlug, buildCanonicalUrl
 * Phase 23 (TDD RED → GREEN)
 */
import { describe, it, expect } from 'vitest'
import { buildUrlSlug, classifySlug, buildCanonicalUrl } from './url-slug'

describe('buildUrlSlug', () => {
  it('창원 4단계 — gu 있음', () =>
    expect(buildUrlSlug('창원시', '성산구', '내동', '대우2차')).toBe('창원시/성산구/내동/대우2차'))
  it('김해 3단계 — gu=null', () =>
    expect(buildUrlSlug('김해시', null, '내동', '리버사이드팰리스')).toBe('김해시/내동/리버사이드팰리스'))
  it('si=null → null', () =>
    expect(buildUrlSlug(null, null, '내동', '대우2차')).toBeNull())
  it('dong=null → null', () =>
    expect(buildUrlSlug('창원시', '성산구', null, '대우2차')).toBeNull())
  it('canonicalName=null → null', () =>
    expect(buildUrlSlug('창원시', '성산구', '내동', null)).toBeNull())
})

describe('classifySlug', () => {
  it('length 1 → si', () => expect(classifySlug(['창원시'])).toBe('si'))
  it('length 2 → gu', () => expect(classifySlug(['창원시', '성산구'])).toBe('gu'))
  it('length 3 → dong-or-complex', () =>
    expect(classifySlug(['창원시', '성산구', '내동'])).toBe('dong-or-complex'))
  it('length 4 → complex', () =>
    expect(classifySlug(['창원시', '성산구', '내동', '대우2차'])).toBe('complex'))
  it('length 5+ → invalid', () =>
    expect(classifySlug(['a', 'b', 'c', 'd', 'e'])).toBe('invalid'))
})

describe('buildCanonicalUrl', () => {
  it('한글 세그먼트 encodeURIComponent 인코딩', () => {
    const url = buildCanonicalUrl('https://danjiondo.kr', ['창원시', '성산구'])
    expect(url).toBe('https://danjiondo.kr/%EC%B0%BD%EC%9B%90%EC%8B%9C/%EC%84%B1%EC%82%B0%EA%B5%AC')
  })
  it('루트 site URL 유지', () => {
    const url = buildCanonicalUrl('https://danjiondo.kr', ['창원시'])
    expect(url.startsWith('https://danjiondo.kr/')).toBe(true)
  })
})
