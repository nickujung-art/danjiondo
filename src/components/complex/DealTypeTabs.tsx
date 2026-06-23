'use client'

import { useMemo, useCallback, useEffect } from 'react'
import { parseAsString, parseAsStringEnum, useQueryState } from 'nuqs'
import useEmblaCarousel from 'embla-carousel-react'
import { TransactionChart } from './TransactionChart'
import type { RawTransaction } from '@/lib/data/complex-detail'
import { filterByPeriod, type PeriodKey } from '@/lib/utils/period-filter'
import { extractTypedAreaGroups, filterByTypedArea } from '@/lib/utils/area-groups'
import { computeIqrOutliers } from '@/lib/utils/iqr'

interface Props {
  rawSaleData:   RawTransaction[]
  rawJeonseData: RawTransaction[]
}

type DealTab = 'sale' | 'jeonse'

// D-01: 월세 탭 제거 — 매매/전세 두 탭만 유지
const TABS: { id: DealTab; label: string }[] = [
  { id: 'sale',   label: '매매' },
  { id: 'jeonse', label: '전세' },
]

const TAB_KEYS: DealTab[] = ['sale', 'jeonse']

const PERIOD_OPTIONS: { id: PeriodKey; label: string }[] = [
  { id: '1y',  label: '1년' },
  { id: '3y',  label: '3년' },
  { id: '5y',  label: '5년' },
  { id: 'all', label: '전체' },
]

export function DealTypeTabs({ rawSaleData, rawJeonseData }: Props) {
  // D-12: 탭 상태 nuqs URL 동기화 — 매매↔전세 URL 공유 가능 (?tab=jeonse)
  const [active, setActive] = useQueryState(
    'tab',
    parseAsStringEnum<DealTab>(['sale', 'jeonse'])
      .withDefault('sale')
      .withOptions({ clearOnDefault: true, shallow: true, history: 'replace' }),
  )
  const activeTabIndex = TAB_KEYS.indexOf(active)

  // D-02: 기간 필터 nuqs URL 상태 (기본값 '3y', clearOnDefault로 URL 청소)
  // shallow:true — 필터 변경 시 서버 컴포넌트 재요청 방지 (클라이언트 슬라이스만)
  const [period, setPeriod] = useQueryState(
    'period',
    parseAsStringEnum<PeriodKey>(['1y', '3y', '5y', 'all'])
      .withDefault('3y')
      .withOptions({ clearOnDefault: true, shallow: true, history: 'replace' }),
  )

  // D-04: 평형 필터 nuqs URL 상태 (각 탭 공유)
  const [area, setArea] = useQueryState(
    'area',
    parseAsString
      .withDefault('')
      .withOptions({ shallow: true, history: 'replace' }),
  )

  // Embla 카루셀 설정 (Pitfall 6: startIndex로 URL 직접 진입 시 올바른 탭 시작)
  const [emblaRef, emblaApi] = useEmblaCarousel({
    startIndex: activeTabIndex,
  })

  // 스와이프 완료 → active 탭 + URL 상태 동기화 (Pitfall 6 해결)
  const onSelect = useCallback(() => {
    if (!emblaApi) return
    const newIndex = emblaApi.selectedScrollSnap()
    const newTab = TAB_KEYS[newIndex]
    if (newTab) void setActive(newTab)
  }, [emblaApi, setActive])

  useEffect(() => {
    if (!emblaApi) return
    emblaApi.on('select', onSelect)
    return () => { emblaApi.off('select', onSelect) }
  }, [emblaApi, onSelect])

  // 탭 버튼 클릭 → Embla 동기화
  useEffect(() => {
    if (emblaApi && emblaApi.selectedScrollSnap() !== activeTabIndex) {
      emblaApi.scrollTo(activeTabIndex)
    }
  }, [emblaApi, activeTabIndex])

  // 각 탭의 평형 그룹 (Embla에서 두 슬라이드가 항상 렌더링되므로 별도 계산)
  const saleAreaGroups   = useMemo(() => extractTypedAreaGroups(rawSaleData), [rawSaleData])
  const jeonseAreaGroups = useMemo(() => extractTypedAreaGroups(rawJeonseData), [rawJeonseData])

  const selectedSaleAreaKey = useMemo(() => {
    if (!area) return saleAreaGroups[0]?.key ?? null
    if (!saleAreaGroups.some(g => g.key === area)) return saleAreaGroups[0]?.key ?? null
    return area
  }, [area, saleAreaGroups])

  const selectedJeonseAreaKey = useMemo(() => {
    if (!area) return jeonseAreaGroups[0]?.key ?? null
    if (!jeonseAreaGroups.some(g => g.key === area)) return jeonseAreaGroups[0]?.key ?? null
    return area
  }, [area, jeonseAreaGroups])

  // 각 탭의 차트 데이터 계산
  const { normal: saleNormal, outliers: saleOutliers } = useMemo(() => {
    if (selectedSaleAreaKey == null) return { normal: [], outliers: [] }
    const byArea   = filterByTypedArea(rawSaleData, selectedSaleAreaKey)
    const byPeriod = filterByPeriod(byArea, period)
    const points   = byPeriod.map(r => ({ yearMonth: r.yearMonth, price: r.price, area: r.area }))
    return computeIqrOutliers(points)
  }, [rawSaleData, selectedSaleAreaKey, period])

  const { normal: jeonseNormal, outliers: jeonseOutliers } = useMemo(() => {
    if (selectedJeonseAreaKey == null) return { normal: [], outliers: [] }
    const byArea   = filterByTypedArea(rawJeonseData, selectedJeonseAreaKey)
    const byPeriod = filterByPeriod(byArea, period)
    const points   = byPeriod.map(r => ({ yearMonth: r.yearMonth, price: r.price, area: r.area }))
    return computeIqrOutliers(points)
  }, [rawJeonseData, selectedJeonseAreaKey, period])

  return (
    <div>
      {/* 탭 행 — sticky top-14 (AppHeader 56px 바로 아래) + 44px 터치 타겟 (D-10) */}
      <div className="sticky top-14 z-30 bg-white border-b border-[var(--line-default)] -mx-6 px-6">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {TABS.map((tab, idx) => (
            <button
              key={tab.id}
              onClick={() => { void setActive(tab.id); emblaApi?.scrollTo(idx) }}
              className="tab min-h-[44px]"
              data-orange-active={active === tab.id ? 'true' : undefined}
              style={{ background: 'none' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 기간 필터 (탭 공통, Embla 외부) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 6,
          margin: '12px 0',
        }}
      >
        <div role="radiogroup" aria-label="기간 선택" style={{ display: 'flex', gap: 6 }}>
          {PERIOD_OPTIONS.map((opt) => {
            const isActive = period === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => void setPeriod(opt.id)}
                className={`btn btn-sm ${isActive ? 'btn-orange' : 'btn-secondary'}`}
                style={{ minHeight: 32, padding: '4px 10px' }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Embla 캐러셀 — content 영역 스와이프 (overflow-hidden 필수) */}
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {/* Slide 0: 매매 */}
          <div className="min-w-full">
            {/* 매매 평형 칩 */}
            <div
              role="radiogroup"
              aria-label="평형 선택"
              style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
            >
              {saleAreaGroups.length === 0 ? (
                <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                  거래 없음
                </span>
              ) : (
                saleAreaGroups.map((group) => {
                  const isActive = selectedSaleAreaKey === group.key
                  return (
                    <button
                      key={group.key}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => void setArea(group.key)}
                      className={`btn btn-sm ${isActive ? 'btn-orange' : 'btn-secondary'}`}
                      style={{ minHeight: 32, padding: '4px 12px' }}
                      title={group.isNamed ? `네이버 공식 평형: ${group.label}` : `약 ${Math.round(parseInt(group.key) / 3.3058)}평`}
                    >
                      {group.label}
                    </button>
                  )
                })
              )}
            </div>
            <TransactionChart normal={saleNormal} outliers={saleOutliers} dealType="sale" />
          </div>

          {/* Slide 1: 전세 */}
          <div className="min-w-full">
            {/* 전세 평형 칩 */}
            <div
              role="radiogroup"
              aria-label="평형 선택"
              style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
            >
              {jeonseAreaGroups.length === 0 ? (
                <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
                  거래 없음
                </span>
              ) : (
                jeonseAreaGroups.map((group) => {
                  const isActive = selectedJeonseAreaKey === group.key
                  return (
                    <button
                      key={group.key}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => void setArea(group.key)}
                      className={`btn btn-sm ${isActive ? 'btn-orange' : 'btn-secondary'}`}
                      style={{ minHeight: 32, padding: '4px 12px' }}
                      title={group.isNamed ? `네이버 공식 평형: ${group.label}` : `약 ${Math.round(parseInt(group.key) / 3.3058)}평`}
                    >
                      {group.label}
                    </button>
                  )
                })
              )}
            </div>
            <TransactionChart normal={jeonseNormal} outliers={jeonseOutliers} dealType="jeonse" />
          </div>
        </div>
      </div>
    </div>
  )
}
