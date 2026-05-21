'use client'

import { Map as KakaoMapView, useKakaoLoader } from 'react-kakao-maps-sdk'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { prefetchPriceHistory } from '@/lib/price-history-cache'
import { type ComplexMapItem } from '@/lib/data/complexes-map'
import { determineBadge } from '@/components/map/markers/badge-logic'
import { ComplexMarker } from './ComplexMarker'
import { DongClusterChip, type GuChip } from './DongClusterChip'
import { MapSidePanel } from './MapSidePanel'

interface Props {
  complexes:      ComplexMapItem[]
  initialCenter?: { lat: number; lng: number }
  initialLevel?:  number
}

const DEFAULT_CENTER = { lat: 35.2278, lng: 128.6817 }
const DEFAULT_LEVEL  = 8

export function KakaoMap({
  complexes,
  initialCenter = DEFAULT_CENTER,
  initialLevel  = DEFAULT_LEVEL,
}: Props) {
  const [loading, error] = useKakaoLoader({
    appkey: process.env.NEXT_PUBLIC_KAKAO_JS_KEY!,
    libraries: ['services'],
  })
  const [visibleComplexes,  setVisibleComplexes]  = useState<ComplexMapItem[]>([])
  const [mapLevel,          setMapLevel]           = useState<number>(DEFAULT_LEVEL)
  const [selectedComplexId, setSelectedComplexId]  = useState<string | null>(null)

  const p95ViewCount = useMemo(() => {
    if (complexes.length === 0) return 0
    const viewCounts = [...complexes].map((c) => c.view_count).sort((a, b) => a - b)
    const p95Idx     = Math.floor(complexes.length * 0.95)
    return viewCounts[p95Idx] ?? 0
  }, [complexes])

  const highVolumeTopPct = useMemo(() => {
    if (complexes.length === 0) return 5
    const highCount = complexes.filter(c => c.tx_count_30d >= 5).length
    return Math.max(1, Math.round(highCount / complexes.length * 100))
  }, [complexes])

  // 줌 레벨 3단계 정책
  // level ≥ 8: 구 단위 칩만 — 뷰포트에 단지 400개 이상으로 마커 겹침
  // level 7  : 가격 라벨 표시 (~160 단지)
  // level ≤ 6: 가격 라벨 + 단지명 표시 (~80 단지)
  const showOnlyCluster = mapLevel >= 8
  const showLabel       = !showOnlyCluster
  const showName        = mapLevel <= 6

  // 구 단위 칩: level ≥ 8일 때만 계산
  const guChips = useMemo<GuChip[]>(() => {
    if (!showOnlyCluster) return []

    type AccEntry = {
      totalLat: number
      totalLng: number
      count:    number
      maxPrice: number | null
      lats:     number[]
      lngs:     number[]
    }
    const guMap = new Map<string, AccEntry>()

    for (const c of complexes) {
      const key = c.gu ?? '기타'
      const priceEst = c.recent_price ?? (
        c.avg_sale_per_pyeong !== null && c.avg_sale_per_pyeong > 0
          ? Math.round(c.avg_sale_per_pyeong * 25)
          : null
      )
      const entry = guMap.get(key)
      if (!entry) {
        guMap.set(key, {
          totalLat: c.lat,
          totalLng: c.lng,
          count:    1,
          maxPrice: priceEst,
          lats:     [c.lat],
          lngs:     [c.lng],
        })
      } else {
        entry.totalLat += c.lat
        entry.totalLng += c.lng
        entry.count    += 1
        entry.lats.push(c.lat)
        entry.lngs.push(c.lng)
        if (priceEst !== null) {
          entry.maxPrice = entry.maxPrice !== null
            ? Math.max(entry.maxPrice, priceEst)
            : priceEst
        }
      }
    }

    return Array.from(guMap.entries()).map(([gu, e]) => ({
      gu,
      lat:        e.totalLat / e.count,
      lng:        e.totalLng / e.count,
      maxPrice:   e.maxPrice,
      memberLats: e.lats,
      memberLngs: e.lngs,
    }))
  }, [showOnlyCluster, complexes])

  // 뷰포트 내 단지 id 변경 시 가격 이력 프리페치
  useEffect(() => {
    if (showOnlyCluster || visibleComplexes.length === 0) return
    const ids = visibleComplexes.map(c => c.id)
    const timer = setTimeout(() => prefetchPriceHistory(ids), 400)
    return () => clearTimeout(timer)
  }, [visibleComplexes, showOnlyCluster])

  // 지도 이동/줌 시 뷰포트 내 단지 필터링 (supercluster 없이 단순 bounds 체크)
  const updateVisible = useCallback(
    (map: kakao.maps.Map) => {
      const level  = map.getLevel()
      const bounds = map.getBounds()
      const sw     = bounds.getSouthWest()
      const ne     = bounds.getNorthEast()
      setMapLevel(level)
      setVisibleComplexes(
        complexes.filter(c =>
          c.lat >= sw.getLat() && c.lat <= ne.getLat() &&
          c.lng >= sw.getLng() && c.lng <= ne.getLng(),
        ),
      )
    },
    [complexes],
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-400">
        카카오 지도 로딩 중…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-red-50 text-sm text-red-500 flex-col gap-2 p-4 text-center">
        <span>카카오 지도 SDK 로드 실패</span>
        <span className="text-xs text-gray-400">{String(error)}</span>
        <span className="text-xs text-gray-400">NEXT_PUBLIC_KAKAO_JS_KEY가 올바르게 설정되어 있는지, Kakao 콘솔에서 해당 도메인이 등록되어 있는지 확인하세요.</span>
      </div>
    )
  }

  return (
    <>
      <KakaoMapView
        center={initialCenter}
        level={initialLevel}
        className="h-full w-full"
        onCreate={updateVisible}
        onIdle={updateVisible}
      >
        {/* level ≥ 10: 구 단위 칩 1개씩 */}
        {showOnlyCluster && guChips.map((chip) => (
          <DongClusterChip key={chip.gu} {...chip} />
        ))}

        {/* level ≤ 9: 뷰포트 내 개별 단지 마커 */}
        {!showOnlyCluster && visibleComplexes.map((c) => {
          const badge = determineBadge({
            status:            c.status,
            built_year:        c.built_year,
            is_new_record_30d: c.is_new_record_30d,
            tx_count_30d:      c.tx_count_30d,
            view_count:        c.view_count,
            p95_view_count:    p95ViewCount,
          })

          const displayPrice    = showLabel ? c.recent_price           : null
          const displayAvg      = showLabel ? c.avg_sale_per_pyeong    : null
          const detailHousehold = showName  ? c.household_count        : null
          const detailBuiltYear = showName  ? c.built_year             : null

          return (
            <ComplexMarker
              key={c.id}
              id={c.id}
              name={c.canonical_name}
              lat={c.lat}
              lng={c.lng}
              badge={badge}
              onSelect={setSelectedComplexId}
              householdCount={detailHousehold}
              si={c.si}
              gu={c.gu}
              recentPrice={displayPrice ?? (displayAvg !== null && displayAvg > 0 ? Math.round(displayAvg * 25) : null)}
              recentDate={c.recent_date}
              recentAreaM2={c.recent_area_m2}
              builtYear={detailBuiltYear}
              avgSalePerPyeong={displayAvg}
              highVolumeTopPct={highVolumeTopPct}
            />
          )
        })}
      </KakaoMapView>
      <MapSidePanel
        selectedComplexId={selectedComplexId}
        onClose={() => setSelectedComplexId(null)}
      />
    </>
  )
}
