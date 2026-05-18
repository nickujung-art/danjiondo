'use client'

import { CustomOverlayMap } from 'react-kakao-maps-sdk'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { HouseMarker } from './markers/HouseMarker'
import type { BadgeType } from './markers/badge-logic'

interface PricePoint { month: string; price: number }

function formatPrice(price: number): string {
  const eok = Math.floor(price / 10000)
  const man = price % 10000
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`
  if (eok > 0) return `${eok}억`
  return `${price.toLocaleString()}만`
}

// 미니 차트 컴포넌트 — 월별 평균 거래가 추이 선 그래프
function MiniPriceChart({ data }: { data: PricePoint[] }) {
  if (data.length < 2) return null

  const W = 164, H = 48
  const pad = { l: 4, r: 4, t: 4, b: 14 }
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b

  const ps = data.map(d => d.price)
  const minP = Math.min(...ps)
  const maxP = Math.max(...ps)
  const range = maxP - minP || Math.max(maxP * 0.1, 1)

  const pts = data.map((d, i) => ({
    x: pad.l + (i / (data.length - 1)) * plotW,
    y: pad.t + (1 - (d.price - minP) / range) * plotH,
  }))

  const areaPoints = [
    `${pts[0]!.x},${pad.t + plotH}`,
    ...pts.map(p => `${p.x},${p.y}`),
    `${pts[pts.length - 1]!.x},${pad.t + plotH}`,
  ].join(' ')

  const linePoints = pts.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* 영역 채우기 */}
      <polygon points={areaPoints} fill="#FFF7ED" />
      {/* 추이선 */}
      <polyline
        points={linePoints}
        fill="none"
        stroke="#F97316"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 데이터 점 */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="#F97316" />
      ))}
      {/* 첫/마지막 월 라벨 */}
      <text x={pts[0]!.x} y={H - 2} textAnchor="start" fontSize="8" fill="#9CA3AF" fontFamily="system-ui,sans-serif">
        {data[0]!.month.slice(5, 7)}월
      </text>
      <text x={pts[pts.length - 1]!.x} y={H - 2} textAnchor="end" fontSize="8" fill="#9CA3AF" fontFamily="system-ui,sans-serif">
        {data[data.length - 1]!.month.slice(5, 7)}월
      </text>
    </svg>
  )
}

interface Props {
  id:             string
  name:           string
  lat:            number
  lng:            number
  badge:          BadgeType
  onSelect:       (id: string) => void
  householdCount: number | null
  si:             string | null
  gu:             string | null
  recentPrice:    number | null
  recentDate:     string | null
  recentAreaM2:   number | null
  builtYear:      number | null
}

export const ComplexMarker = memo(function ComplexMarker({
  id, name, lat, lng,
  badge, onSelect, householdCount,
  si, gu, recentPrice, recentDate, recentAreaM2, builtYear,
}: Props) {
  const [hover, setHover] = useState(false)
  const [chartData, setChartData] = useState<PricePoint[] | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasFetchedRef = useRef(false)

  const handleMouseEnter = useCallback(() => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null }
    setHover(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setHover(false), 150)
  }, [])

  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current) }, [])

  // 첫 hover 시 가격 이력 fetch (이후 캐시)
  useEffect(() => {
    if (!hover || hasFetchedRef.current) return
    hasFetchedRef.current = true
    let cancelled = false
    fetch(`/api/complexes/${id}/price-history`)
      .then(r => r.json())
      .then((data: { prices: PricePoint[] }) => { if (!cancelled) setChartData(data.prices ?? []) })
      .catch(() => { if (!cancelled) setChartData([]) })
    return () => { cancelled = true }
  }, [hover, id])

  // area_m2 → 평 변환 (0 제외)
  const pyeong = recentAreaM2 !== null && recentAreaM2 > 0
    ? (recentAreaM2 / 3.3058).toFixed(1)
    : null

  const sigu = [si, gu].filter(Boolean).join(' ')

  return (
    <CustomOverlayMap position={{ lat, lng }} xAnchor={0.5} yAnchor={1.0} zIndex={hover ? 10 : 1}>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        {/* hover 툴팁: 핀 바로 위에 절대 위치 */}
        {hover && (
          <div
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: 6,
              background: 'white',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
              padding: '10px 12px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              pointerEvents: 'auto',
              whiteSpace: 'nowrap',
              minWidth: 190,
              zIndex: 100,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {/* 단지명 + 시구 */}
            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: 1 }}>
              {name}
            </div>
            {sigu && (
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>
                {sigu}
              </div>
            )}

            {/* 최근 실거래 */}
            {(recentPrice !== null || recentDate !== null || pyeong !== null) && (
              <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 6, marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>최근 실거래</div>
                {recentPrice !== null && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                    {formatPrice(recentPrice)}
                  </div>
                )}
                {recentDate && (
                  <div style={{ fontSize: 11, color: '#6B7280' }}>{recentDate}</div>
                )}
                {pyeong !== null && (
                  <div style={{ fontSize: 11, color: '#6B7280' }}>{pyeong}평</div>
                )}
              </div>
            )}

            {/* 미니 실거래 차트 — 항상 섹션 표시, 데이터 상태에 따라 내용 분기 */}
            <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 6, marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>실거래 추이</div>
              {chartData === null
                ? <div style={{ fontSize: 11, color: '#D1D5DB', height: 48, display: 'flex', alignItems: 'center' }}>불러오는 중…</div>
                : chartData.length < 2
                  ? <div style={{ fontSize: 10, color: '#D1D5DB', height: 48, display: 'flex', alignItems: 'center' }}>최근 거래 없음</div>
                  : <MiniPriceChart data={chartData} />
              }
            </div>

            {/* 세대수 · 준공연도 · 신축 배지 */}
            {(householdCount !== null || builtYear !== null) && (
              <div style={{
                borderTop: '1px solid #F3F4F6',
                paddingTop: 6,
                fontSize: 11,
                color: '#6B7280',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '2px 4px',
              }}>
                {householdCount !== null && (
                  <span>{householdCount.toLocaleString()}세대</span>
                )}
                {householdCount !== null && builtYear !== null && <span>·</span>}
                {builtYear !== null && <span>{builtYear}년</span>}
                {badge === 'new_build' && builtYear !== null && (
                  <span style={{
                    padding: '1px 4px',
                    background: '#CCFBF1',
                    color: '#0D9488',
                    borderRadius: 3,
                    fontSize: 9,
                    fontWeight: 700,
                    lineHeight: 1.5,
                  }}>
                    신축
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* 핀 */}
        <div
          onClick={() => onSelect(id)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          role="button"
          aria-label={`${name} 단지 선택`}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(id) }}
        >
          <HouseMarker badge={badge} recentPrice={recentPrice} name={name} />
        </div>
      </div>
    </CustomOverlayMap>
  )
})
