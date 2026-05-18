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

function getAccentColor(badge: BadgeType): string {
  if (badge === 'pre_sale') return '#EF4444'
  if (badge === 'new_build') return '#14B8A6'
  if (badge === 'hot')       return '#F97316'
  return '#94A3B8'
}

export const HouseMarker = memo(function HouseMarker({
  badge, recentPrice, pyeong, name,
}: HouseMarkerProps) {
  const accent     = getAccentColor(badge)
  const showCrown  = badge === 'hot' || badge === 'new_build'

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.18))',
        userSelect: 'none',
      }}
      aria-label={name}
    >
      {/* 레이블 칩 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: 'white',
          border: `1.5px solid ${accent}`,
          borderRadius: 4,
          paddingTop: 5,
          paddingBottom: 5,
          paddingLeft: 4,
          paddingRight: 8,
        }}
      >
        {/* 왼쪽 색상 강조 바 */}
        <div
          style={{
            width: 3,
            alignSelf: 'stretch',
            background: accent,
            borderRadius: 1,
            flexShrink: 0,
          }}
        />

        {/* 왕관 아이콘 (hot·new_build) */}
        {showCrown && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/img/crown.png"
            alt=""
            width={11}
            height={11}
            style={{ flexShrink: 0, opacity: 0.65 }}
          />
        )}

        {/* 텍스트 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {recentPrice !== null ? (
            <>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#111827',
                  lineHeight: 1,
                  letterSpacing: '-0.4px',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatPriceShort(recentPrice)}
              </span>
              {pyeong != null && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 400,
                    color: '#9CA3AF',
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
                fontSize: 10,
                fontWeight: 400,
                color: '#CBD5E1',
                lineHeight: 1,
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              —
            </span>
          )}
        </div>
      </div>

      {/* 포인터: 줄기 + 점 */}
      <div style={{ width: 1.5, height: 5, background: accent }} />
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: accent }} />
    </div>
  )
})
