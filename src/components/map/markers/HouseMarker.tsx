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
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.20))',
        userSelect: 'none',
      }}
      aria-label={name}
    >
      {/* 지붕: 35px 폭, V선, 회색 */}
      <svg
        width="35"
        height="14"
        viewBox="0 0 35 14"
        fill="none"
        style={{ display: 'block', overflow: 'visible', marginBottom: 4 }}
      >
        <path
          d="M0,14 L17.5,2 L35,14"
          stroke="#9CA3AF"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* 왕관 — hot 단지만, 바디 바로 위 성채 스타일 (바디와 동색으로 이어짐) */}
      {isHot && (
        <svg width="44" height="8" viewBox="0 0 44 8" style={{ display: 'block' }}>
          <rect x="4"  y="0" width="8" height="6" fill={bodyColor} />
          <rect x="18" y="0" width="8" height="6" fill={bodyColor} />
          <rect x="32" y="0" width="8" height="6" fill={bodyColor} />
          {/* 이음 기단부 — 이빨과 바디를 자연스럽게 연결 */}
          <rect x="0"  y="3" width="44" height="5" fill={bodyColor} />
        </svg>
      )}

      {/* 바디: 가격 + 평형 */}
      <div
        style={{
          width: 44,
          minHeight: 22,
          background: recentPrice !== null ? bodyColor : '#9CA3AF',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 3,
          paddingBottom: 3,
          gap: 1,
        }}
      >
        {recentPrice !== null ? (
          <>
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
            {pyeong != null && (
              <span
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: 9,
                  fontWeight: 500,
                  lineHeight: 1,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              >
                {pyeong}평
              </span>
            )}
          </>
        ) : (
          <span
            style={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: 8,
              fontWeight: 400,
              lineHeight: 1,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            정보없음
          </span>
        )}
      </div>

      {/* 포인터 삼각형 */}
      <svg width="44" height="9" viewBox="0 0 44 9" style={{ display: 'block' }}>
        <polygon
          points="14,0 22,9 30,0"
          fill={recentPrice !== null ? bodyColor : '#9CA3AF'}
        />
      </svg>
    </div>
  )
})
