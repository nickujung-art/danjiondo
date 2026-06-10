/**
 * sitemap 데이터 헬퍼 테스트 — encodeSlug 인코딩 동작 + D-09 fallback 문서화
 * Phase 23 (W4b)
 */
import { describe, it, expect } from 'vitest'
import { encodeSlug } from './sitemap'

describe('encodeSlug', () => {
  it('한글 슬러그 각 세그먼트 encodeURIComponent 인코딩', () => {
    // 창원시/성산구/내동 → 각 세그먼트 별도 인코딩 (/ 는 인코딩 안 함)
    expect(encodeSlug('창원시/성산구/내동')).toBe(
      '%EC%B0%BD%EC%9B%90%EC%8B%9C/%EC%84%B1%EC%82%B0%EA%B5%AC/%EB%82%B4%EB%8F%99'
    )
  })

  it('단일 세그먼트 인코딩', () => {
    expect(encodeSlug('창원시')).toBe('%EC%B0%BD%EC%9B%90%EC%8B%9C')
  })

  it('4단계 단지 슬러그 인코딩', () => {
    const encoded = encodeSlug('창원시/성산구/내동/대우2차')
    // 슬래시는 그대로, 한글만 인코딩
    expect(encoded.split('/').length).toBe(4)
    expect(encoded.startsWith('%EC%B0%BD%EC%9B%90%EC%8B%9C/')).toBe(true)
  })
})

// D-09 fallback 문서화:
// url_slug=null인 ~143개 단지는 src/app/sitemap.ts에서 /complexes/[id] URL로 처리됨.
// 이 동작은 src/app/sitemap.ts의 통합 확인 (npm run build + curl /sitemap.xml)으로 검증.
