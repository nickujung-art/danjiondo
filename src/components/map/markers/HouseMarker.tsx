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
        지붕 SVG — 항상 22px 높이, 왕관 유무와 무관하게 레이아웃 고정.
        상단 10px(y=0-10): 왕관이 hot 배지일 때 채워짐 (없으면 투명)
        하단 12px(y=10-22): 회색 V선 (peak y=10)
        왕관은 V 꼭짓점 안에 완전히 들어오는 크기/위치
      */}
      <svg
        width="54"
        height="22"
        viewBox="0 0 54 22"
        fill="none"
        style={{ display: 'block', marginBottom: 0 }}
      >
        {isHot && (
          <g transform="translate(19, 0)" fill={bodyColor}>
            <circle cx="2"  cy="3.5" r="2.2" />
            <circle cx="8"  cy="1.5" r="2.2" />
            <circle cx="14" cy="3.5" r="2.2" />
            <path d="M0,11 L0,7 L2.5,5.5 L5.5,8.5 L8,4.5 L10.5,8.5 L13.5,5.5 L16,7 L16,11 Z" />
          </g>
        )}
        <path
          d="M0,22 L27,10 L54,22"
          stroke="#9CA3AF"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* 바디: 가격 + 평형 */}
      <div
        style={{
          width: 54,
          minHeight: 28,
          background: bodyColor,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 4,
          paddingBottom: 4,
          gap: 2,
        }}
      >
        {recentPrice !== null && (
          <>
            <span
              style={{
                color: 'white',
                fontSize: 12,
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
      <svg width="54" height="10" viewBox="0 0 54 10" style={{ display: 'block' }}>
        <polygon points="19,0 27,10 35,0" fill={bodyColor} />
      </svg>
    </div>
  )
})
