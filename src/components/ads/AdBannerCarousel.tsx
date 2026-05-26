'use client'

import { useEffect, useState } from 'react'
import { AdBanner } from '@/components/ads/AdBanner'
import type { AdCampaign } from '@/lib/data/ads'

const ROTATION_INTERVAL_MS = 4000

interface Props {
  ads: AdCampaign[]
}

export function AdBannerCarousel({ ads }: Props) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (ads.length <= 1) return
    const timer = setInterval(() => {
      setIndex(prev => (prev + 1) % ads.length)
    }, ROTATION_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [ads.length])

  if (ads.length === 0) return null

  const ad = ads[index]
  if (!ad) return null

  return (
    <div style={{ marginBottom: 28 }}>
      <AdBanner ad={ad} />
    </div>
  )
}
