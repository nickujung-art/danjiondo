'use client'

import { memo } from 'react'
import { CustomOverlayMap, useMap } from 'react-kakao-maps-sdk'

export interface GuChip {
  gu:         string
  lat:        number
  lng:        number
  maxPrice:   number | null
  memberLats: number[]
  memberLngs: number[]
}

function formatPrice(price: number): string {
  const eok = Math.floor(price / 10000)
  const man = price % 10000
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`
  if (eok > 0) return `${eok}억`
  return `${price.toLocaleString()}만`
}

export const DongClusterChip = memo(function DongClusterChip({
  gu, lat, lng, maxPrice, memberLats, memberLngs,
}: GuChip) {
  const map = useMap('DongClusterChip')

  const handleClick = () => {
    const bounds = new window.kakao.maps.LatLngBounds()
    for (let i = 0; i < memberLats.length; i++) {
      bounds.extend(new window.kakao.maps.LatLng(memberLats[i] ?? 0, memberLngs[i] ?? 0))
    }
    map.setBounds(bounds)
  }

  return (
    <CustomOverlayMap position={{ lat, lng }} xAnchor={0.5} yAnchor={0.5} zIndex={5}>
      <div
        onClick={handleClick}
        role="button"
        aria-label={`${gu} 클릭하면 해당 지역으로 확대됩니다`}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
        style={{
          background: 'white',
          border: '1.5px solid #E5E7EB',
          borderRadius: 20,
          padding: '10px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 2,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
          {gu}
        </span>
        {maxPrice !== null && (
          <span style={{ fontSize: 12, fontWeight: 500, color: '#F97316', lineHeight: 1.2 }}>
            {formatPrice(maxPrice)}
          </span>
        )}
      </div>
    </CustomOverlayMap>
  )
})
