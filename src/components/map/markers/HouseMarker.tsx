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
  const showCrown = badge === 'hot' || badge === 'new_build'

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.25))',
        userSelect: 'none',
      }}
      aria-label={name}
    >
      {/*
        지붕 SVG — 회색 채움(#E5E7EB), V 꼭짓점 (27, 8)
        왕관 translate(19, 11): circle1 top y≈12.5 > V left at x=21(y≈12.44) ✓
        separator line y=23, x=7~47 (V 내부 ✓, V fills to x=6.75~47.25 at y=23)
        신축(teal)·거래상위(orange) 모두 bodyColor 왕관
      */}
      <svg
        width="54"
        height="28"
        viewBox="0 0 54 28"
        fill="none"
        style={{ display: 'block', marginBottom: 0 }}
      >
        {/* 회색 지붕 채움 */}
        <path d="M0,28 L27,8 L54,28 Z" fill="#E5E7EB" />

        {/* 왕관 + 구분선 (hot·new_build만) */}
        {showCrown && (
          <>
            <g transform="translate(19, 11)" fill={bodyColor}>
              <circle cx="2"  cy="3.5" r="2" />
              <circle cx="8"  cy="1.5" r="2" />
              <circle cx="14" cy="3.5" r="2" />
              <path d="M0,10 L0,6.5 L2.5,5 L5.5,7.5 L8,4 L10.5,7.5 L13.5,5 L16,6.5 L16,10 Z" />
            </g>
            <line
              x1="7" y1="23" x2="47" y2="23"
              stroke={bodyColor} strokeWidth="1" strokeOpacity="0.5"
            />
          </>
        )}

        {/* 지붕 외곽선 */}
        <path
          d="M0,28 L27,8 L54,28"
          stroke="#D1D5DB"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* 바디 */}
      <div
        style={{
          width: 54,
          minHeight: 44,
          background: bodyColor,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 6,
          paddingBottom: 6,
          gap: 3,
        }}
      >
        {recentPrice !== null && (
          <>
            <span
              style={{
                color: 'white',
                fontSize: 13,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '-0.3px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              {formatPriceShort(recentPrice)}
            </span>
            {pyeong != null && (
              <span
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 10,
                  fontWeight: 400,
                  lineHeight: 1,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              >
                {pyeong}평
              </span>
            )}
          </>
        )}
      </div>

      {/* 포인터 삼각형 — 이전보다 작게 */}
      <svg width="54" height="8" viewBox="0 0 54 8" style={{ display: 'block' }}>
        <polygon points="21,0 27,8 33,0" fill={bodyColor} />
      </svg>
    </div>
  )
})
