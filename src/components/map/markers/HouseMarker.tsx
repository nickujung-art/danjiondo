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

// Material 스타일 왕관 — 3개 원 + 5포인트 솔리드 바디
function CrownIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="13" viewBox="0 0 24 15" fill={color} style={{ display: 'block' }}>
      {/* 3개 꼭지 원 */}
      <circle cx="3"  cy="5"  r="2.8" />
      <circle cx="12" cy="2"  r="2.8" />
      <circle cx="21" cy="5"  r="2.8" />
      {/* 왕관 바디: 중앙이 가장 높은 5포인트 */}
      <path d="M0,15 L0,9 L4.5,6 L9,11 L12,5.5 L15,11 L19.5,6 L24,9 L24,15 Z" />
    </svg>
  )
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
      {/* 지붕: 왕관 유무와 무관하게 항상 같은 위치 */}
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

      {/* 바디: relative로 왕관을 absolute 배치 → 지붕 위치 불변 */}
      <div style={{ position: 'relative' }}>
        {/* 왕관 — hot 단지만, 바디 상단에 absolute 오버레이 */}
        {isHot && (
          <div style={{
            position: 'absolute',
            top: -11,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2,
            lineHeight: 0,
            pointerEvents: 'none',
          }}>
            <CrownIcon color="white" />
          </div>
        )}

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
          )}
        </div>
      </div>

      {/* 포인터 삼각형 */}
      <svg width="44" height="9" viewBox="0 0 44 9" style={{ display: 'block' }}>
        <polygon points="14,0 22,9 30,0" fill={bodyColor} />
      </svg>
    </div>
  )
})
