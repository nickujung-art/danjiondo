/**
 * AdBannerCarousel 테스트 — Phase 16 Plan 01
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import type { AdCampaign } from '@/lib/data/ads'

vi.mock('server-only', () => ({}))

// AdBanner는 fetch를 호출하므로 mock 처리
vi.mock('@/components/ads/AdBanner', () => ({
  AdBanner: ({ ad }: { ad: AdCampaign }) => (
    <div data-testid="ad-banner" data-id={ad.id}>{ad.title}</div>
  ),
}))

function makeAd(id: string, title: string): AdCampaign {
  return {
    id,
    advertiser_id: null,
    advertiser_name: '테스트광고주',
    title,
    image_url: 'https://example.com/img.jpg',
    link_url: 'https://example.com',
    placement: 'banner_top',
    starts_at: new Date(Date.now() - 86400_000).toISOString(),
    ends_at: new Date(Date.now() + 86400_000).toISOString(),
    status: 'approved',
    budget_won: null,
    created_at: new Date().toISOString(),
  } as AdCampaign
}

describe('AdBannerCarousel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ads=[] → 아무것도 렌더링하지 않는다', async () => {
    const { AdBannerCarousel } = await import('@/components/ads/AdBannerCarousel')
    const { container } = render(<AdBannerCarousel ads={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('ads=[단일광고] → 인덱스 0 광고를 렌더링한다', async () => {
    const { AdBannerCarousel } = await import('@/components/ads/AdBannerCarousel')
    const ads = [makeAd('ad-1', '광고 하나')]
    const { getByTestId } = render(<AdBannerCarousel ads={ads} />)
    expect(getByTestId('ad-banner').dataset.id).toBe('ad-1')
  })

  it('ads=[광고1, 광고2] → 초기에 인덱스 0이 표시된다', async () => {
    const { AdBannerCarousel } = await import('@/components/ads/AdBannerCarousel')
    const ads = [makeAd('ad-1', '광고 하나'), makeAd('ad-2', '광고 둘')]
    const { getByTestId } = render(<AdBannerCarousel ads={ads} />)
    expect(getByTestId('ad-banner').dataset.id).toBe('ad-1')
  })

  it('ads=[광고1, 광고2] → 4초 후 인덱스 1로 전환된다', async () => {
    const { AdBannerCarousel } = await import('@/components/ads/AdBannerCarousel')
    const ads = [makeAd('ad-1', '광고 하나'), makeAd('ad-2', '광고 둘')]
    const { getByTestId } = render(<AdBannerCarousel ads={ads} />)
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(getByTestId('ad-banner').dataset.id).toBe('ad-2')
  })
})
