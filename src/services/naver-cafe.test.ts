import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

describe('searchCafeArticles', () => {
  beforeEach(() => {
    process.env.NAVER_CLIENT_ID = 'test-id'
    process.env.NAVER_CLIENT_SECRET = 'test-secret'
  })

  it('Naver API 응답을 CafeArticleItem[]으로 변환하고 HTML 태그를 제거한다', async () => {
    const mockItems = [
      {
        title: '<b>창원 단지</b> 매물',
        link: 'https://cafe.naver.com/article/123',
        description: '<p>내용</p>',
        cafename: '창원부동산',
        pubDate: 'Thu, 01 Jan 2026 00:00:00 +0900',
      },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: mockItems }),
    } as Response)

    const { searchCafeArticles } = await import('./naver-cafe')
    const result = await searchCafeArticles('창원 단지')

    expect(result).toHaveLength(1)
    expect(result[0]?.title).not.toContain('<b>')
    expect(result[0]?.articleId).toBe('https://cafe.naver.com/article/123')
    expect(result[0]?.articleUrl).toBe('https://cafe.naver.com/article/123')
  })
})
