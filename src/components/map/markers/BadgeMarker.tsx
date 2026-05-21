'use client'

import type { BadgeType } from './badge-logic'

// 평당가(만원/평)에 따른 마커 색상 반환 — BadgeMarker 전용
function getPriceColor(avgSalePerPyeong: number | null): string {
  if (avgSalePerPyeong === null || avgSalePerPyeong === 0) return '#6B7280'
  if (avgSalePerPyeong < 800) return '#10B981'
  if (avgSalePerPyeong < 1500) return '#F59E0B'
  return '#EF4444'
}

interface BadgeMarkerProps {
  badge:      BadgeType
  priceLabel: number | null  // null이면 라벨 숨김
}

// ── SVG 배지 컴포넌트 ──────────────────────────────────────

function PreSalePin() {
  // 골드 핀 — pre_sale (분양 단지)
  return (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" aria-label="분양 단지">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 10.67 16 24 16 24S32 26.67 32 16C32 7.16 24.84 0 16 0z" fill="#D97706"/>
      <circle cx="16" cy="16" r="7" fill="#FDE68A"/>
      <path d="M13 18l-3-3 1.4-1.4 1.6 1.6 4.6-4.6L19 12l-6 6z" fill="#92400E"/>
    </svg>
  )
}

function NewBuildPin() {
  // 민트 핀 — new_build (신축 2021+)
  return (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" aria-label="신축 단지">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 10.67 16 24 16 24S32 26.67 32 16C32 7.16 24.84 0 16 0z" fill="#059669"/>
      <circle cx="16" cy="16" r="7" fill="#A7F3D0"/>
      <path d="M16 10v12M10 16h12" stroke="#065F46" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

function HotPin() {
  // 불꽃 핀 — hot (조회수 상위 5%)
  return (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" aria-label="인기 단지">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 10.67 16 24 16 24S32 26.67 32 16C32 7.16 24.84 0 16 0z" fill="#DC2626"/>
      <path d="M16 8c0 4-3 6-3 10a3 3 0 006 0c0-4-3-6-3-10z" fill="#FEF2F2"/>
      <path d="M16 14c0 2-1.5 3-1.5 5a1.5 1.5 0 003 0c0-2-1.5-3-1.5-5z" fill="#DC2626"/>
    </svg>
  )
}

function DefaultPin({ color }: { color: string }) {
  return (
    <svg width="28" height="36" viewBox="0 0 28 36" fill="none" aria-label="단지">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22S28 23.33 28 14C28 6.27 21.73 0 14 0z" fill={color}/>
      <circle cx="14" cy="14" r="5" fill="white" opacity="0.9"/>
    </svg>
  )
}

// ── 배지 선택 ──────────────────────────────────────────────

function BadgePin({ badge, color }: { badge: BadgeType; color: string }) {
  switch (badge) {
    case 'pre_sale':  return <PreSalePin />
    case 'new_build': return <NewBuildPin />
    case 'new_record':
    case 'high_volume':
    case 'popular':   return <HotPin />
    default:          return <DefaultPin color={color} />
  }
}

// ── 외부 내보내기 ──────────────────────────────────────────

export function BadgeMarker({ badge, priceLabel }: BadgeMarkerProps) {
  const color = getPriceColor(priceLabel)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <BadgePin badge={badge} color={color} />
      {priceLabel !== null && priceLabel > 0 && (
        <div
          style={{
            marginTop: 2,
            padding: '1px 4px',
            background: 'white',
            border: `1px solid ${color}`,
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 600,
            color,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
          }}
        >
          {priceLabel.toLocaleString()}만
        </div>
      )}
    </div>
  )
}
