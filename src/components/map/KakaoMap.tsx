'use client'

import { Map as KakaoMapView, useKakaoLoader } from 'react-kakao-maps-sdk'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { prefetchPriceHistory } from '@/lib/price-history-cache'
import { type ComplexMapItem } from '@/lib/data/complexes-map'
import { type PresaleMapPin } from '@/lib/data/presale-pins'
import { type AdCampaign } from '@/lib/data/ads'
import { determineBadge } from '@/components/map/markers/badge-logic'
import { ComplexMarker } from './ComplexMarker'
import { PresalePin } from './PresalePin'
import { AdMapPopup } from './AdMapPopup'
import { DongClusterChip, type GuChip, type DongChip, computeDongChips, deduplicateDongChips } from './DongClusterChip'
import { MapSidePanel } from './MapSidePanel'

interface Props {
  complexes:      ComplexMapItem[]
  presalePins?:   PresaleMapPin[]
  mapPopupAds?:   AdCampaign[]
  initialCenter?: { lat: number; lng: number }
  initialLevel?:  number
}

const DEFAULT_CENTER = { lat: 35.2278, lng: 128.6817 }
const DEFAULT_LEVEL  = 8
const MAP_STATE_KEY  = 'map_state'

function readSavedState(
  fallbackCenter: { lat: number; lng: number },
  fallbackLevel:  number,
): { center: { lat: number; lng: number }; level: number } {
  try {
    const raw = sessionStorage.getItem(MAP_STATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { center: { lat: number; lng: number }; level: number }
      if (parsed.center?.lat && parsed.center?.lng && parsed.level) return parsed
    }
  } catch {}
  return { center: fallbackCenter, level: fallbackLevel }
}

export function KakaoMap({
  complexes,
  presalePins   = [],
  mapPopupAds   = [],
  initialCenter = DEFAULT_CENTER,
  initialLevel  = DEFAULT_LEVEL,
}: Props) {
  const [loading, error] = useKakaoLoader({
    appkey: process.env.NEXT_PUBLIC_KAKAO_JS_KEY!,
    libraries: ['services'],
  })
  const [initCenter] = useState<{ lat: number; lng: number }>(() =>
    readSavedState(initialCenter, initialLevel).center
  )
  const [initLevel] = useState<number>(() =>
    readSavedState(initialCenter, initialLevel).level
  )
  const [visibleComplexes,  setVisibleComplexes]  = useState<ComplexMapItem[]>([])
  const [visiblePresalePins, setVisiblePresalePins] = useState<PresaleMapPin[]>([])
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

  // 줌 레벨 정책 (4단계)
  // level ≥ 8 : 구/시 단위 칩만
  // level 6~7 : 동 단위 칩 + pre_sale 개별 마커
  // level ≤ 5 : 개별 마커 전체 + 단지명
  const showOnlyGuCluster = mapLevel >= 8
  const showDongCluster   = !showOnlyGuCluster && mapLevel >= 6
  const showAllMarkers    = mapLevel <= 5
  const showLabel         = mapLevel <= 7
  const showName          = mapLevel <= 5

  // 구/시 단위 칩: level ≥ 8일 때만 계산
  const guChips = useMemo<GuChip[]>(() => {
    if (!showOnlyGuCluster) return []

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
      // 김해시는 gu=null이므로 si 폴백 사용. 둘 다 없으면 구 클러스터에서 제외
      const key = c.gu ?? c.si
      if (!key) continue
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
  }, [showOnlyGuCluster, complexes])

  // 동 단위 칩: level 6~7일 때만 계산, greedy 거리 필터로 겹침 방지
  const dongChips = useMemo<DongChip[]>(() => {
    if (!showDongCluster) return []
    const all = computeDongChips(visibleComplexes)
    // level 7(광역) → 1km, level 6(근접) → 550m 임계값으로 겹침 제거
    const thresholdDeg = mapLevel === 7 ? 0.009 : 0.005
    return deduplicateDongChips(all, thresholdDeg)
  }, [showDongCluster, visibleComplexes, mapLevel])

  // pre_sale 개별 마커: level 7~8에서 분양 단지만 표시
  const preSaleComplexes = useMemo(() => {
    if (!showDongCluster) return []
    return visibleComplexes.filter(c => c.status === 'pre_sale')
  }, [showDongCluster, visibleComplexes])

  // 개별 마커 전체: level ≤ 6
  const displayComplexes = useMemo(() => {
    if (!showAllMarkers) return []
    return [...visibleComplexes].sort((a, b) =>
      (a.tx_count_30d * 10 + a.view_count) - (b.tx_count_30d * 10 + b.view_count),
    )
  }, [showAllMarkers, visibleComplexes])

  // 뷰포트 내 단지 id 변경 시 가격 이력 프리페치
  useEffect(() => {
    if (!showAllMarkers || displayComplexes.length === 0) return
    const ids = displayComplexes.map(c => c.id)
    const timer = setTimeout(() => prefetchPriceHistory(ids), 400)
    return () => clearTimeout(timer)
  }, [displayComplexes, showAllMarkers])

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
      setVisiblePresalePins(
        presalePins.filter(p =>
          p.lat >= sw.getLat() && p.lat <= ne.getLat() &&
          p.lng >= sw.getLng() && p.lng <= ne.getLng(),
        ),
      )
      try {
        const center = map.getCenter()
        sessionStorage.setItem(MAP_STATE_KEY, JSON.stringify({
          center: { lat: center.getLat(), lng: center.getLng() },
          level,
        }))
      } catch {}
    },
    [complexes, presalePins],
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
        center={initCenter}
        level={initLevel}
        className="h-full w-full"
        onCreate={updateVisible}
        onIdle={updateVisible}
      >
        {/* level ≥ 8: 구/시 단위 칩 */}
        {showOnlyGuCluster && guChips.map((chip) => (
          <DongClusterChip key={chip.gu} {...chip} />
        ))}

        {/* level 6~7: 동 단위 칩 */}
        {showDongCluster && dongChips.map((chip) => (
          <DongClusterChip
            key={`${chip.gu ?? '기타'}_${chip.dong}`}
            mode="dong"
            {...chip}
          />
        ))}

        {/* level 6~7: pre_sale 개별 마커 (분양 단지는 동 레벨에서도 항상 표시) */}
        {showDongCluster && preSaleComplexes.map((c) => {
          const badge = determineBadge({
            status:            c.status,
            built_year:        c.built_year,
            is_new_record_30d: c.is_new_record_30d,
            tx_count_30d:      c.tx_count_30d,
            view_count:        c.view_count,
            p95_view_count:    p95ViewCount,
          })

          const displayPrice = showLabel ? c.recent_price : null
          const displayAvg   = showLabel ? c.avg_sale_per_pyeong : null

          return (
            <ComplexMarker
              key={c.id}
              id={c.id}
              name={c.canonical_name}
              lat={c.lat}
              lng={c.lng}
              badge={badge}
              onSelect={setSelectedComplexId}
              householdCount={null}
              si={c.si}
              gu={c.gu}
              recentPrice={displayPrice ?? (displayAvg !== null && displayAvg > 0 ? Math.round(displayAvg * 25) : null)}
              recentDate={c.recent_date}
              recentAreaM2={c.recent_area_m2}
              builtYear={null}
              avgSalePerPyeong={displayAvg}
              highVolumeTopPct={highVolumeTopPct}
            />
          )
        })}

        {/* level ≤ 7: 입주예정 핀 (분양완료·공사중 단지) */}
        {mapLevel <= 7 && visiblePresalePins.map((p) => (
          <PresalePin key={p.id} {...p} />
        ))}

        {/* level ≤ 5: 개별 단지 마커 전체 */}
        {showAllMarkers && displayComplexes.map((c) => {
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
        {/* 지도 팝업 광고 — 모든 줌 레벨에서 표시 */}
        {mapPopupAds
          .filter(ad => ad.target_lat !== null && ad.target_lng !== null)
          .map(ad => (
            <AdMapPopup
              key={ad.id}
              ad={ad as AdCampaign & { target_lat: number; target_lng: number }}
            />
          ))
        }
      </KakaoMapView>
      <MapSidePanel
        selectedComplexId={selectedComplexId}
        onClose={() => setSelectedComplexId(null)}
      />
    </>
  )
}
