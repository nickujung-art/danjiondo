'use client'

import { useState } from 'react'
import { ValueQuadrantChart } from '@/components/complex/ValueQuadrantChart'
import { DistrictStatsCard } from '@/components/complex/DistrictStatsCard'
import type { QuadrantPoint } from '@/components/complex/ValueQuadrantChart'

interface QuadrantData {
  points: QuadrantPoint[]
  medianX: number
  medianY: number
  regionLabel: string
  totalCount: number
}

interface DistrictStats {
  adm_nm:            string | null
  population:        number | null
  households:        number | null
  data_year:         number | null
  data_quarter:      number | null
  population_change: number | null
  pop_under20:       number | null
  pop_20s:           number | null
  pop_30s:           number | null
  pop_40s:           number | null
  pop_50s:           number | null
  pop_60plus:        number | null
}

interface AnalysisSectionProps {
  quadrantData: QuadrantData | null
  districtStats: DistrictStats | null
  districtName: string
}

type TabId = 'quadrant' | 'district'

export function AnalysisSection({
  quadrantData,
  districtStats,
  districtName,
}: AnalysisSectionProps) {
  const [activeTab, setActiveTab] = useState<TabId>('quadrant')

  const tabs: { id: TabId; label: string }[] = [
    { id: 'quadrant', label: '가성비 분석' },
    { id: 'district', label: '지역 통계' },
  ]

  return (
    <div className="card" style={{ padding: '24px' }}>
      {/* 탭 헤더 */}
      <div
        role="tablist"
        aria-label="분석 탭"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--line-default)',
          marginBottom: '20px',
          gap: '0',
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 16px',
                font: `${isActive ? '600' : '500'} 14px/1 var(--font-sans)`,
                color: isActive ? 'var(--dj-orange)' : 'var(--fg-sec)',
                background: 'none',
                border: 'none',
                borderBottom: isActive
                  ? '2px solid var(--dj-orange)'
                  : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: '-1px',
                transition: 'color 150ms, border-color 150ms',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 가성비 분석 패널 */}
      <div
        id="tabpanel-quadrant"
        role="tabpanel"
        aria-labelledby="tab-quadrant"
        hidden={activeTab !== 'quadrant'}
      >
        {quadrantData ? (
          <ValueQuadrantChart
            data={quadrantData.points}
            medianX={quadrantData.medianX}
            medianY={quadrantData.medianY}
            regionLabel={quadrantData.regionLabel}
            totalCount={quadrantData.totalCount}
          />
        ) : (
          <p
            style={{
              font: '500 13px/1.6 var(--font-sans)',
              color: 'var(--fg-tertiary)',
              textAlign: 'center',
              padding: '32px 0',
              margin: 0,
            }}
          >
            가성비 분석 데이터가 아직 수집되지 않았습니다.
          </p>
        )}
      </div>

      {/* 지역 통계 패널 */}
      <div
        id="tabpanel-district"
        role="tabpanel"
        aria-labelledby="tab-district"
        hidden={activeTab !== 'district'}
      >
        <DistrictStatsCard
          districtName={districtStats?.adm_nm ?? districtName}
          population={districtStats?.population ?? null}
          households={districtStats?.households ?? null}
          dataYear={districtStats?.data_year ?? null}
          dataQuarter={districtStats?.data_quarter ?? null}
          populationChange={districtStats?.population_change ?? null}
          popUnder20={districtStats?.pop_under20 ?? null}
          pop20s={districtStats?.pop_20s ?? null}
          pop30s={districtStats?.pop_30s ?? null}
          pop40s={districtStats?.pop_40s ?? null}
          pop50s={districtStats?.pop_50s ?? null}
          pop60plus={districtStats?.pop_60plus ?? null}
        />
      </div>
    </div>
  )
}
