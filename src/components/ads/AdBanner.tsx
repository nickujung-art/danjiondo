'use client'

import { useEffect, useRef } from 'react'
import type { AdCampaign } from '@/lib/data/ads'

interface Props {
  ad: AdCampaign
}

export function AdBanner({ ad }: Props) {
  const lastReportedId = useRef<string | null>(null)

  useEffect(() => {
    if (lastReportedId.current === ad.id) return
    lastReportedId.current = ad.id
    void fetch('/api/ads/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaign_id: ad.id, event_type: 'impression' }),
    })
  }, [ad.id])

  function handleClick() {
    void fetch('/api/ads/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaign_id: ad.id, event_type: 'click' }),
    })
  }

  return (
    <a
      href={ad.link_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      style={{ display: 'block', textDecoration: 'none' }}
    >
      <div
        className="card"
        style={{ padding: 0, overflow: 'hidden', position: 'relative' }}
      >
        <span
          style={{
            position: 'absolute',
            top: 8,
            right: 10,
            font: '500 10px/1 var(--font-sans)',
            color: 'var(--fg-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            background: 'rgba(255,255,255,0.85)',
            padding: '2px 5px',
            borderRadius: 3,
            zIndex: 1,
          }}
        >
          광고
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ad.image_url}
          alt={ad.title}
          style={{ width: '100%', display: 'block', objectFit: 'cover' }}
        />
        <div style={{ padding: '10px 12px' }}>
          <div
            style={{
              font: '600 13px/1.3 var(--font-sans)',
              color: 'var(--fg-pri)',
              marginBottom: 2,
            }}
          >
            {ad.title}
          </div>
          <div
            style={{
              font: '500 11px/1.3 var(--font-sans)',
              color: 'var(--fg-tertiary)',
            }}
          >
            {ad.advertiser_name}
          </div>
        </div>
      </div>
    </a>
  )
}
