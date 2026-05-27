'use client'

import { useEffect, useState } from 'react'
import { AdBanner } from './AdBanner'
import type { AdCampaign } from '@/lib/data/ads'

interface Props {
  sggCode: string
}

export function SidebarAdsSection({ sggCode }: Props) {
  const [ads, setAds] = useState<AdCampaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void fetch(`/api/ads/sidebar?sgg_code=${encodeURIComponent(sggCode)}`)
      .then(r => r.json())
      .then((data: unknown) => {
        if (data && typeof data === 'object' && 'ads' in data && Array.isArray((data as { ads: unknown }).ads)) {
          setAds((data as { ads: AdCampaign[] }).ads)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [sggCode])

  if (loading) {
    return <div style={{ minHeight: 120 }} aria-hidden />
  }

  if (ads.length === 0) return null

  return (
    <>
      {ads.map(ad => (
        <AdBanner key={ad.id} ad={ad} />
      ))}
    </>
  )
}
