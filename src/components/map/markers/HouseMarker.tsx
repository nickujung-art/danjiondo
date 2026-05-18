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
  const isHot = badge === 'hot'

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
        지붕 SVG (높이 28px) — V 꼭짓점: (27, 8), 하단: (0,28)/(54,28)
        왕관 translate(19, 18): 왕관 바닥(y=28) = 바디 상단 → 이어지는 느낌
        V 경사 at x=19: y=8+(27-19)*20/27≈14 → 왕관 상단(y≈19.5) 내부 ✓
      */}
      <svg
        width="54"
        height="28"
        viewBox="0 0 54 28"
        fill="none"
        style={{ display: 'block', marginBottom: 0 }}
      >
        {isHot && (
          <g transform="translate(19, 18)" fill={bodyColor}>
            <circle cx="2"  cy="3.5" r="2" />
            <circle cx="8"  cy="1.5" r="2" />
            <circle cx="14" cy="3.5" r="2" />
            <path d="M0,10 L0,6.5 L2.5,5 L5.5,7.5 L8,4 L10.5,7.5 L13.5,5 L16,6.5 L16,10 Z" />
          </g>
        )}
        <path
          d="M0,28 L27,8 L54,28"
          stroke="#9CA3AF"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* 바디 — 정사각형에 가깝게 (54×44) */}
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
          gap: 4,
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
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: 11,
                  fontWeight: 600,
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

      {/* 포인터 삼각형 */}
      <svg width="54" height="11" viewBox="0 0 54 11" style={{ display: 'block' }}>
        <polygon points="19,0 27,11 35,0" fill={bodyColor} />
      </svg>
    </div>
  )
})
