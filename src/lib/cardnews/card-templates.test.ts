/**
 * TDD RED: card-templates.ts 카드 렌더 함수 테스트
 * Task 1 RED phase — 구현 전 실패해야 함
 */
import { describe, it, expect } from 'vitest'

describe('card-templates preview functions', () => {
  it('renderCoverPreview — CDN Pretendard 폰트 URL을 포함한 HTML을 반환한다', async () => {
    const { renderCoverPreview } = await import('./card-templates')
    const html = renderCoverPreview({ week: '2026-01 W1', region: '창원', area: '84㎡' })
    expect(html).toContain('cdn.jsdelivr.net/gh/orioncactus/pretendard')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('창원')
  })

  it('renderClosingPreview — D-08 법적 표기 2줄을 포함한다', async () => {
    const { renderClosingPreview } = await import('./card-templates')
    const html = renderClosingPreview({})
    expect(html).toContain('출처: 국토교통부 실거래가 공개시스템')
    expect(html).toContain('본 데이터는 신고 기준이며 실제 거래와 차이가 있을 수 있습니다')
  })

  it('renderHighlightPreview — TOP 3 랭킹을 포함한 HTML을 반환한다', async () => {
    const { renderHighlightPreview } = await import('./card-templates')
    const ranking = [
      { rank: 1, name: '창원아파트', price: '7억', subtitle: '의창구' },
      { rank: 2, name: '김해아파트', price: '6억 5,000', subtitle: '김해시' },
      { rank: 3, name: '마산아파트', price: '5억', subtitle: '마산합포구' },
    ]
    const html = renderHighlightPreview({
      week: '2026-01 W1',
      region: '창원',
      area: '84㎡',
      period: '2026-01-01 ~ 2026-01-07',
      source: '국토교통부',
      ranking,
    })
    expect(html).toContain('HIGHLIGHT')
    expect(html).toContain('창원아파트')
  })

  it('renderRankingPreview — TOP 10 전체 순위 HTML을 반환한다', async () => {
    const { renderRankingPreview } = await import('./card-templates')
    const ranking = Array.from({ length: 5 }, (_, i) => ({
      rank: i + 1,
      name: `단지${i + 1}`,
      price: `${10 - i}억`,
    }))
    const html = renderRankingPreview({
      week: '2026-01 W1',
      region: '창원',
      area: null,
      period: '2026-01-01 ~ 2026-01-07',
      source: '국토교통부',
      ranking,
    })
    expect(html).toContain('FULL RANKING')
    expect(html).toContain('단지1')
  })
})
