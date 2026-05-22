'use client'

import { memo } from 'react'
import { CustomOverlayMap, useMap } from 'react-kakao-maps-sdk'
import type { ComplexMapItem } from '@/lib/data/complexes-map'

export interface GuChip {
  gu:         string
  lat:        number
  lng:        number
  maxPrice:   number | null
  memberLats: number[]
  memberLngs: number[]
}

export interface DongChip {
  gu:         string | null
  dong:       string
  lat:        number
  lng:        number
  count:      number
  maxPrice:   number | null
  memberLats: number[]
  memberLngs: number[]
}

function formatPrice(price: number): string {
  const eok = Math.floor(price / 10000)
  const man = price % 10000
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`
  if (eok > 0) return `${eok}억`
  return `${price.toLocaleString()}만`
}

type Props =
  | (GuChip   & { mode?: 'gu' })
  | (DongChip & { mode: 'dong' })

export const DongClusterChip = memo(function DongClusterChip(props: Props) {
  const map = useMap('DongClusterChip')

  const handleClick = () => {
    if (props.mode === 'dong') {
      map.setCenter(new window.kakao.maps.LatLng(props.lat, props.lng))
      map.setLevel(5)
    } else {
      map.setCenter(new window.kakao.maps.LatLng(props.lat, props.lng))
      map.setLevel(7)
    }
  }

  const label    = props.mode === 'dong' ? props.dong : props.gu
  const subLabel = props.mode === 'dong' ? `${props.count}개 단지` : null
  const ariaLabel = props.mode === 'dong'
    ? `${props.dong} ${props.count}개 단지, 클릭하면 해당 동으로 확대됩니다`
    : `${props.gu} 클릭하면 해당 지역으로 확대됩니다`

  return (
    <CustomOverlayMap position={{ lat: props.lat, lng: props.lng }} xAnchor={0.5} yAnchor={0.5} zIndex={5}>
      <div
        onClick={handleClick}
        role="button"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
        style={{
          background: 'white',
          border: '1.5px solid #E5E7EB',
          borderRadius: 20,
          padding: '10px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 2,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
          {label}
        </span>
        {subLabel !== null && (
          <span style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', lineHeight: 1.2 }}>
            {subLabel}
          </span>
        )}
        {props.maxPrice !== null && (
          <span style={{ fontSize: 12, fontWeight: 500, color: '#F97316', lineHeight: 1.2 }}>
            {formatPrice(props.maxPrice)}
          </span>
        )}
      </div>
    </CustomOverlayMap>
  )
})

/**
 * complexes 배열을 동(dong) 단위로 그룹화하여 DongChip[] 반환.
 * groupBy key = `${gu ?? si ?? '기타'}_${dong ?? '기타'}`
 * 중심 좌표 = 그룹 내 단지 lat/lng 평균
 * maxPrice = recent_price 최댓값 (null인 단지는 제외)
 */
export function computeDongChips(complexes: ComplexMapItem[]): DongChip[] {
  type AccEntry = {
    gu:       string | null
    dong:     string
    totalLat: number
    totalLng: number
    count:    number
    maxPrice: number | null
    lats:     number[]
    lngs:     number[]
  }

  const dongMap = new Map<string, AccEntry>()

  for (const c of complexes) {
    const guKey  = c.gu ?? c.si ?? '기타'
    const dongKey = c.dong ?? '기타'
    const key    = `${guKey}_${dongKey}`

    const entry = dongMap.get(key)
    if (!entry) {
      dongMap.set(key, {
        gu:       c.gu,
        dong:     dongKey,
        totalLat: c.lat,
        totalLng: c.lng,
        count:    1,
        maxPrice: c.recent_price,
        lats:     [c.lat],
        lngs:     [c.lng],
      })
    } else {
      entry.totalLat += c.lat
      entry.totalLng += c.lng
      entry.count    += 1
      entry.lats.push(c.lat)
      entry.lngs.push(c.lng)
      if (c.recent_price !== null) {
        entry.maxPrice = entry.maxPrice !== null
          ? Math.max(entry.maxPrice, c.recent_price)
          : c.recent_price
      }
    }
  }

  return Array.from(dongMap.values()).map(e => ({
    gu:         e.gu,
    dong:       e.dong,
    lat:        e.totalLat / e.count,
    lng:        e.totalLng / e.count,
    count:      e.count,
    maxPrice:   e.maxPrice,
    memberLats: e.lats,
    memberLngs: e.lngs,
  }))
}

/**
 * 동 칩 greedy 중복 제거.
 * count 내림차순(단지 수 많은 동 우선) 후, 이미 선택된 칩과의 거리가
 * thresholdDeg 이내인 칩을 제거.
 * thresholdDeg: 위도/경도 단위 (1도 ≈ 111km)
 *   level 7 → 0.009 (~1km), level 6 → 0.005 (~550m) 권장
 */
export function deduplicateDongChips(chips: DongChip[], thresholdDeg: number): DongChip[] {
  const sorted = [...chips].sort((a, b) => b.count - a.count)
  const accepted: DongChip[] = []

  for (const chip of sorted) {
    const tooClose = accepted.some(a => {
      const dlat = chip.lat - a.lat
      const dlng = chip.lng - a.lng
      return Math.sqrt(dlat * dlat + dlng * dlng) < thresholdDeg
    })
    if (!tooClose) accepted.push(chip)
  }

  return accepted
}
