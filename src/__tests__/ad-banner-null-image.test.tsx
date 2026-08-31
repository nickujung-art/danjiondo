/**
 * AdBanner — image_url null 렌더링 테스트
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import type { AdCampaign } from '@/lib/data/ads'

vi.mock('server-only', () => ({}))

function makeAd(imageUrl: string | null): AdCampaign {
  return {
    id: 'test-ad',
    advertiser_id: null,
    advertiser_name: '테스트광고주',
    title: '테스트 광고',
    image_url: imageUrl,
    link_url: 'https://example.com',
    placement: 'banner_top',
    starts_at: new Date(Date.now() - 86400_000).toISOString(),
    ends_at: new Date(Date.now() + 86400_000).toISOString(),
    status: 'approved',
    budget_won: null,
    created_at: new Date().toISOString(),
  } as AdCampaign
}

describe('AdBanner — image_url null 처리', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 201 }))))
  })

  it('image_url이 null이면 img 태그 없이 텍스트만 렌더링한다', async () => {
    const { AdBanner } = await import('@/components/ads/AdBanner')
    const ad = makeAd(null)
    const { container, getByText } = render(<AdBanner ad={ad} />)
    expect(container.querySelector('img')).toBeNull()
    expect(getByText('테스트 광고')).toBeTruthy()
    expect(getByText('테스트광고주')).toBeTruthy()
  })

  it('image_url이 있으면 img 태그가 렌더링된다', async () => {
    const { AdBanner } = await import('@/components/ads/AdBanner')
    const ad = makeAd('https://example.com/img.jpg')
    const { container } = render(<AdBanner ad={ad} />)
    expect(container.querySelector('img')).toBeTruthy()
  })
})
