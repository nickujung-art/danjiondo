'use client'

import { Map as KakaoMapView, useKakaoLoader } from 'react-kakao-maps-sdk'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { prefetchPriceHistory } from '@/lib/price-history-cache'
import {
  buildClusterIndex,
  type ComplexMapItem,
  type ClusterFeature,
} from '@/lib/data/complexes-map'
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
  const [clusters,          setClusters]         = useState<ClusterFeature[]>([])
  const [mapLevel,          setMapLevel]          = useState<number>(DEFAULT_LEVEL)
  const [selectedComplexId, setSelectedComplexId] = useState<string | null>(null)

  const clusterIndex = useMemo(() => buildClusterIndex(complexes), [complexes])

  const p95ViewCount = useMemo(() => {
    if (complexes.length === 0) return 0
    const viewCounts = [...complexes].map((c) => c.view_count).sort((a, b) => a - b)
    const p95Idx     = Math.floor(complexes.length * 0.95)
    return viewCounts[p95Idx] ?? 0
  }, [complexes])

  // 거래량 상위 N% — 로드된 단지 중 high_volume 임계값(5건) 이상의 비율
  const highVolumeTopPct = useMemo(() => {
    if (complexes.length === 0) return 5
    const highCount = complexes.filter(c => c.tx_count_30d >= 5).length
    return Math.max(1, Math.round(highCount / complexes.length * 100))
  }, [complexes])

  // 줌 레벨 3단계 정책
  // level ≥ 10: 구 단위 칩만 (개별 마커 없음)
  // level 7–9 : 가격 라벨 표시
  // level ≤ 6 : 가격 라벨 + 단지명 표시
  const showOnlyCluster = mapLevel >= 10
  const showLabel       = mapLevel <= 9   // level 7–9 및 ≤6에서 가격 라벨 표시
  const showName        = mapLevel <= 6   // level ≤6에서 단지명 추가 표시

  // 구 단위 칩: level ≥ 10일 때만 계산 (complexes를 구별로 1개씩)
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
      // recent_price 없으면 avg_sale_per_pyeong × 25평으로 추정
      const priceEst = c.recent_price ?? (
        c.avg_sale_per_pyeong !== null ? Math.round(c.avg_sale_per_pyeong * 25) : null
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

  // clusters 변경 시 보이는 단지들의 가격 이력 백그라운드 프리페치
  useEffect(() => {
    if (showOnlyCluster) return
    const ids = clusters
      .filter(f => !f.properties.cluster)
      .map(f => (f.properties as { id: string }).id)
      .filter((id): id is string => typeof id === 'string')
    if (ids.length === 0) return
    const timer = setTimeout(() => prefetchPriceHistory(ids), 400)
    return () => clearTimeout(timer)
  }, [clusters, showOnlyCluster])

  const computeClusters = useCallback(
    (map: kakao.maps.Map) => {
      setMapLevel(map.getLevel())
      const bounds = map.getBounds()
      const sw     = bounds.getSouthWest()
      const ne     = bounds.getNorthEast()
      const zoom   = Math.max(0, 20 - map.getLevel())
      setClusters(
        clusterIndex.getClusters(
          [sw.getLng(), sw.getLat(), ne.getLng(), ne.getLat()],
          zoom,
        ),
      )
    },
    [clusterIndex],
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
        onCreate={computeClusters}
        onIdle={computeClusters}
        onTileLoaded={computeClusters}
      >
        {/* level ≥ 10: 구 단위 칩 1개씩 (DongClusterChip) */}
        {showOnlyCluster && guChips.map((chip) => (
          <DongClusterChip key={chip.gu} {...chip} />
        ))}

        {/* level ≤ 9: 개별 단지 마커 (showLabel=true, level ≤6에서 showName=true) */}
        {!showOnlyCluster && clusters.flatMap((feature) => {
          // cluster 피처 → getLeaves()로 개별 단지 분해 (클러스터에 묶여도 마커 표시)
          const leaves = feature.properties.cluster
            ? clusterIndex.getLeaves(
                (feature.properties as { cluster_id: number }).cluster_id,
                Infinity,
              )
            : [feature]

          return leaves.map((f) => {
            if (f.properties.cluster) return null

            const lng = f.geometry.coordinates[0] ?? 0
            const lat = f.geometry.coordinates[1] ?? 0

            const props = f.properties as {
              id:                  string
              name:                string
              avg_sale_per_pyeong: number | null
              view_count:          number
              price_change_30d:    number | null
              tx_count_30d:        number
              is_new_record_30d:   boolean
              status:              string
              built_year:          number | null
              household_count:     number | null
              hagwon_grade:        string | null
              si:                  string | null
              gu:                  string | null
              dong:                string | null
              recent_price:        number | null
              recent_date:         string | null
              recent_area_m2:      number | null
            }

            const badge = determineBadge({
              status:            props.status            ?? 'active',
              built_year:        props.built_year        ?? null,
              is_new_record_30d: props.is_new_record_30d ?? false,
              tx_count_30d:      props.tx_count_30d      ?? 0,
              view_count:        props.view_count         ?? 0,
              p95_view_count:    p95ViewCount,
            })

            const displayPrice    = showLabel ? (props.recent_price ?? null)        : null
            const displayAvg      = showLabel ? (props.avg_sale_per_pyeong ?? null)  : null
            const detailHousehold = showName  ? (props.household_count ?? null)      : null
            const detailBuiltYear = showName  ? (props.built_year ?? null)           : null

            return (
              <ComplexMarker
                key={props.id}
                id={props.id}
                name={props.name}
                lat={lat}
                lng={lng}
                badge={badge}
                onSelect={setSelectedComplexId}
                householdCount={detailHousehold}
                si={props.si ?? null}
                gu={props.gu ?? null}
                recentPrice={displayPrice}
                recentDate={props.recent_date ?? null}
                recentAreaM2={props.recent_area_m2 ?? null}
                builtYear={detailBuiltYear}
                avgSalePerPyeong={displayAvg}
                highVolumeTopPct={highVolumeTopPct}
              />
            )
          })
        })}
      </KakaoMapView>
      <MapSidePanel
        selectedComplexId={selectedComplexId}
        onClose={() => setSelectedComplexId(null)}
      />
    </>
  )
}
