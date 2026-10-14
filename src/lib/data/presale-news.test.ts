import { describe, it, expect } from 'vitest'
import {
  buildNewsQueries,
  mentionsTargetCity,
  resolveTargetRegion,
  formatRunstat,
} from './presale-news'

describe('buildNewsQueries', () => {
  it('창원·마산·진해·김해 4도시 × 3 쿼리만 만든다', () => {
    const queries = buildNewsQueries()
    expect(queries).toHaveLength(12)
    expect(queries).toContain('창원 아파트 분양 예정')
    expect(queries).toContain('김해 분양 2026')
    expect(queries.some(q => q.startsWith('진주'))).toBe(false)
  })
})

describe('mentionsTargetCity', () => {
  it('창원·김해 및 창원 구지명이 언급되면 true', () => {
    expect(mentionsTargetCity('창원 한신더휴 메가센텀 분양')).toBe(true)
    expect(mentionsTargetCity('김해 신규 단지')).toBe(true)
    expect(mentionsTargetCity('마산회원구 재개발')).toBe(true)
  })

  it('운영권역 밖 지명만 있으면 false (2aa2153 회귀 — 진주·고성 부분일치)', () => {
    expect(mentionsTargetCity('남양주 진주아파트 재건축')).toBe(false)
    expect(mentionsTargetCity('강원 고성 분양')).toBe(false)
  })
})

describe('resolveTargetRegion', () => {
  it('카카오 주소가 창원시면 창원시 (구지명 구 포함)', () => {
    expect(resolveTargetRegion('경남 창원시 성산구 상남동 1')).toBe('창원시')
    expect(resolveTargetRegion('경남 창원시 마산합포구 월영동 1')).toBe('창원시')
  })

  it('카카오 주소가 김해시면 김해시', () => {
    expect(resolveTargetRegion('경남 김해시 대청동 1')).toBe('김해시')
  })

  it('운영권역 밖 주소는 null', () => {
    expect(resolveTargetRegion('서울 성북구 보문동6가 458')).toBeNull()
    expect(resolveTargetRegion('경남 진주시 충무공동 1')).toBeNull()
  })

  it('주소를 모르면 null — "경남" 기본값으로 적재하지 않는다', () => {
    expect(resolveTargetRegion(null)).toBeNull()
    expect(resolveTargetRegion(undefined)).toBeNull()
    expect(resolveTargetRegion('')).toBeNull()
  })
})

describe('formatRunstat', () => {
  it('감지 수와 창원·김해 적재 수를 한 줄로 찍는다', () => {
    expect(formatRunstat({ status: 'ok', items: 54, target: 0 })).toBe(
      '[runstat] job=crawl-presale-news status=ok items=54 target=0',
    )
  })

  it('실패도 같은 형식', () => {
    expect(formatRunstat({ status: 'failed', items: 0, target: 0 })).toBe(
      '[runstat] job=crawl-presale-news status=failed items=0 target=0',
    )
  })
})
