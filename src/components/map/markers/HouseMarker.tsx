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

function getAccentColor(badge: BadgeType, hasData: boolean): string {
  if (!hasData)              return '#94A3B8'
  if (badge === 'pre_sale')  return '#EF4444'
  if (badge === 'new_build') return '#14B8A6'
  return '#F97316'
}

/**
 * crown.png는 흰 배경 PNG이므로 SVG filter로 처리:
 * luminanceToAlpha → 흰 배경(luminance=1)→alpha=1, 검정 왕관→alpha=0
 * feFuncA invert   → 흰 배경 alpha=0(투명), 왕관 alpha=1(불투명)
 * feFlood + feComposite → 왕관 부분만 accent 색으로 채움
 */
function Crown({ color }: { color: string }) {
  const id = `cr${color.replace('#', '')}`
  return (
    <svg width="22" height="16" style={{ display: 'block' }} aria-hidden="true">
      <defs>
        <filter id={id} x="0%" y="0%" width="100%" height="100%">
          <feColorMatrix type="luminanceToAlpha" result="luma" />
          <feComponentTransfer in="luma" result="mask">
            <feFuncA type="linear" slope="-1" intercept="1" />
          </feComponentTransfer>
          <feFlood floodColor={color} floodOpacity="1" result="fill" />
          <feComposite in="fill" in2="mask" operator="in" />
        </filter>
      </defs>
      <image
        href="/img/crown.png"
        x="0" y="0"
        width="22" height="16"
        preserveAspectRatio="xMidYMid meet"
        filter={`url(#${id})`}
      />
    </svg>
  )
}

export const HouseMarker = memo(function HouseMarker({
  badge, recentPrice, pyeong, name,
}: HouseMarkerProps) {
  const accent    = getAccentColor(badge, recentPrice !== null)
  const showCrown = badge === 'hot' || badge === 'new_build'

  return (
    <div
      style={{
        display:      'inline-flex',
        flexDirection: 'column',
        alignItems:   'center',
        filter:       'drop-shadow(0 1px 4px rgba(0,0,0,0.18))',
        userSelect:   'none',
      }}
      aria-label={name}
    >
      {/* 왕관 — 박스 위에 투명하게 떠있음 */}
      {showCrown && (
        <div style={{ marginBottom: 2 }}>
          <Crown color={accent} />
        </div>
      )}

      {/* 가격 박스 */}
      <div
        style={{
          border:       `1.5px solid ${accent}`,
          borderRadius: 4,
          overflow:     'hidden',
        }}
      >
        <div
          style={{
            display:       'flex',
            alignItems:    'center',
            gap:           5,
            background:    'white',
            paddingTop:    5,
            paddingBottom: 5,
            paddingLeft:   4,
            paddingRight:  8,
          }}
        >
          {/* 왼쪽 색상 강조 바 */}
          <div
            style={{
              width:       3,
              alignSelf:   'stretch',
              background:  accent,
              borderRadius: 1,
              flexShrink:  0,
            }}
          />

          {/* 텍스트 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {recentPrice !== null ? (
              <>
                <span
                  style={{
                    fontSize:      12,
                    fontWeight:    700,
                    color:         '#111827',
                    lineHeight:    1,
                    letterSpacing: '-0.4px',
                    fontFamily:    'system-ui, -apple-system, sans-serif',
                    whiteSpace:    'nowrap',
                  }}
                >
                  {formatPriceShort(recentPrice)}
                </span>
                {pyeong != null && (
                  <span
                    style={{
                      fontSize:   9,
                      fontWeight: 400,
                      color:      '#9CA3AF',
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
                  fontSize:   10,
                  fontWeight: 400,
                  color:      '#CBD5E1',
                  lineHeight: 1,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              >
                —
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 포인터: 줄기 + 점 */}
      <div style={{ width: 1.5, height: 5, background: accent }} />
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: accent }} />
    </div>
  )
})
