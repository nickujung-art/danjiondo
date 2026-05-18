'use client'

import { memo } from 'react'
import type { BadgeType } from './badge-logic'

export interface HouseMarkerProps {
  badge:       BadgeType
  recentPrice: number | null
  pyeong?:     string | null
  name:        string
}

function formatPriceShort(price: number): string {
  if (price >= 10000) {
    const tenths = Math.round(price / 1000)
    return tenths % 10 === 0 ? `${tenths / 10}억` : `${(tenths / 10).toFixed(1)}억`
  }
  return `${Math.round(price / 100) * 100}만`
}

function getBodyColor(badge: BadgeType): string {
  if (badge === 'pre_sale') return '#EF4444'
  if (badge === 'new_build') return '#14B8A6'
  return '#F97316'
}

export const HouseMarker = memo(function HouseMarker({
  badge, recentPrice, pyeong, name,
}: HouseMarkerProps) {
  const bodyColor = getBodyColor(badge)

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.20))',
        userSelect: 'none',
      }}
      aria-label={name}
    >
      {/* 지붕: 좌우 폭 좁힘 (40→32), V선 오픈, 회색 */}
      <svg
        width="32"
        height="14"
        viewBox="0 0 32 14"
        fill="none"
        style={{ display: 'block', overflow: 'visible', marginBottom: 4 }}
      >
        <path
          d="M0,14 L16,2 L32,14"
          stroke="#9CA3AF"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* 바디: 가격 + 평형 */}
      <div
        style={{
          width: 44,
          minHeight: 22,
          background: bodyColor,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 3,
          paddingBottom: 3,
          gap: 1,
        }}
      >
        {recentPrice !== null && (
          <span
            style={{
              color: 'white',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '-0.2px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {formatPriceShort(recentPrice)}
          </span>
        )}
        {pyeong !== null && pyeong !== undefined && recentPrice !== null && (
          <span
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 8,
              fontWeight: 500,
              lineHeight: 1,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {pyeong}평
          </span>
        )}
      </div>

      {/* 포인터 삼각형 */}
      <svg width="44" height="9" viewBox="0 0 44 9" style={{ display: 'block' }}>
        <polygon points="14,0 22,9 30,0" fill={bodyColor} />
      </svg>
    </div>
  )
})
