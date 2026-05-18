'use client'

import { memo } from 'react'
import type { BadgeType } from './badge-logic'

export interface HouseMarkerProps {
  badge:       BadgeType
  recentPrice: number | null
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
  badge, recentPrice, name,
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
      {/* 왕관 — hot 배지만, 지붕 위 정상 플로우 */}
      {badge === 'hot' && (
        <svg width="20" height="10" viewBox="0 0 20 10" style={{ display: 'block', marginBottom: 1 }}>
          <path
            d="M0,10 L3,3.5 L7,8 L10,0 L13,8 L17,3.5 L20,10 Z"
            fill="#FCD34D"
            stroke="#D97706"
            strokeWidth="0.8"
          />
        </svg>
      )}

      {/* 지붕: 열린 V선, 끝 라운드, 회색, 아래에서 4px 띄움 */}
      <svg
        width="40"
        height="14"
        viewBox="0 0 40 14"
        fill="none"
        style={{ display: 'block', overflow: 'visible', marginBottom: 4 }}
      >
        <path
          d="M0,14 L20,2 L40,14"
          stroke="#9CA3AF"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* 바디: 실거래가 HTML span */}
      <div
        style={{
          width: 44,
          height: 22,
          background: bodyColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
      </div>

      {/* 포인터 삼각형 */}
      <svg width="44" height="9" viewBox="0 0 44 9" style={{ display: 'block' }}>
        <polygon points="14,0 22,9 30,0" fill={bodyColor} />
      </svg>
    </div>
  )
})
