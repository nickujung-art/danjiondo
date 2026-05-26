'use client'

import { CustomOverlayMap } from 'react-kakao-maps-sdk'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { AdCampaign } from '@/lib/data/ads'

interface Props {
  ad: AdCampaign & { target_lat: number; target_lng: number }
}

const AD_ORANGE = '#F97316'

export function AdMapPopup({ ad }: Props) {
  const [expanded, setExpanded] = useState(true)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const impressionFired = useRef(false)

  useEffect(() => {
    if (impressionFired.current) return
    impressionFired.current = true
    void fetch('/api/ads/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaign_id: ad.id, event_type: 'impression' }),
    })
  }, [ad.id])

  useEffect(() => {
    dismissTimer.current = setTimeout(() => setExpanded(false), 5000)
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current) }
  }, [])

  const handleOpen = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    setExpanded(true)
    dismissTimer.current = setTimeout(() => setExpanded(false), 5000)
  }, [])

  const handleClick = useCallback(() => {
    void fetch('/api/ads/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaign_id: ad.id, event_type: 'click' }),
    })
    window.open(ad.link_url, '_blank', 'noopener,noreferrer')
  }, [ad.id, ad.link_url])

  return (
    <CustomOverlayMap
      position={{ lat: ad.target_lat, lng: ad.target_lng }}
      xAnchor={0.5}
      yAnchor={1.0}
      zIndex={expanded ? 20 : 10}
    >
      <div style={{ position: 'relative', display: 'inline-block', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

        {expanded && (
          <div
            style={{
              position:     'absolute',
              bottom:       '100%',
              left:         '50%',
              transform:    'translateX(-50%)',
              marginBottom: 6,
              background:   'white',
              border:       `1.5px solid ${AD_ORANGE}`,
              borderRadius: 8,
              overflow:     'hidden',
              boxShadow:    '0 4px 16px rgba(0,0,0,0.14)',
              minWidth:     200,
              maxWidth:     240,
              cursor:       'pointer',
              zIndex:       100,
            }}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
            aria-label={`광고: ${ad.title}`}
          >
            <div style={{
              position: 'absolute', top: 6, right: 8,
              font: '500 10px/1 system-ui', color: 'white',
              background: AD_ORANGE, padding: '2px 5px',
              borderRadius: 3, zIndex: 1, textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              광고
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ad.image_url}
              alt={ad.title}
              style={{ width: '100%', display: 'block', maxHeight: 100, objectFit: 'cover' }}
            />
            <div style={{ padding: '8px 10px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginBottom: 2, lineHeight: 1.3 }}>
                {ad.title}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>
                {ad.advertiser_name}
              </div>
            </div>
          </div>
        )}

        <div
          onClick={expanded ? undefined : handleOpen}
          style={{
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
            cursor:        expanded ? 'default' : 'pointer',
            userSelect:    'none',
            filter:        'drop-shadow(0 1px 4px rgba(0,0,0,0.22))',
          }}
          aria-label={expanded ? undefined : '광고 보기'}
          role={expanded ? undefined : 'button'}
          tabIndex={expanded ? undefined : 0}
          onKeyDown={expanded ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') handleOpen() }}
        >
          <div style={{
            background:   AD_ORANGE,
            borderRadius: 12,
            padding:      '3px 8px',
            border:       '1.5px solid white',
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'white', letterSpacing: '-0.2px' }}>
              AD
            </span>
          </div>
          <div style={{ width: 1.5, height: 5, background: AD_ORANGE }} />
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: AD_ORANGE }} />
        </div>
      </div>
    </CustomOverlayMap>
  )
}
