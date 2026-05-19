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
  if (!hasData)              return '#94A3B8'  // 거래 데이터 없음 → 회색
  if (badge === 'pre_sale')  return '#EF4444'  // 분양 → 빨강
  if (badge === 'new_build') return '#14B8A6'  // 신축 → 초록(teal)
  return '#F97316'                             // 일반·거래상위 → 오렌지
}

function CrownSvg({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 16"
      width="16"
      height="11"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <path d="M0 14 L0 16 L24 16 L24 14 L21 5 L17 11 L12 0 L7 11 L3 5 Z" fill={color} />
      <circle cx="3"  cy="5" r="1.5" fill={color} />
      <circle cx="12" cy="0" r="2"   fill={color} />
      <circle cx="21" cy="5" r="1.5" fill={color} />
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
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.18))',
        userSelect: 'none',
      }}
      aria-label={name}
    >
      {/* 왕관 — 박스 외부 상단 중앙, accent 색상 */}
      {showCrown && (
        <div style={{ marginBottom: 2 }}>
          <CrownSvg color={accent} />
        </div>
      )}

      {/* 가격 박스 */}
      <div
        style={{
          border: `1.5px solid ${accent}`,
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'white',
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
      </div>

      {/* 포인터: 줄기 + 점 */}
      <div style={{ width: 1.5, height: 5, background: accent }} />
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: accent }} />
    </div>
  )
})
