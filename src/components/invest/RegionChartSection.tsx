'use client'

import { useState } from 'react'
import { RegionalPriceChartWrapper } from './RegionalPriceChartWrapper'
import type { RegionalPricePoint, PredictionPoint } from '@/lib/data/invest'

type HorizonVal = 3 | 6 | 12

interface HorizonOption {
  label:         string
  value:         HorizonVal
  historyMonths: number   // 차트에 보여줄 히스토리 개월
}

const HORIZON_OPTIONS: HorizonOption[] = [
  { label: '3개월', value: 3,  historyMonths: 12 },
  { label: '6개월', value: 6,  historyMonths: 24 },
  { label: '1년',   value: 12, historyMonths: 36 },
]

interface Props {
  history:        RegionalPricePoint[]  // 서버에서 36개월치 전달
  allPredictions: PredictionPoint[]     // 슬라이스 없이 전달 (보통 5~6개월)
  initialHorizon: HorizonVal
  sggCode:        string
  areaBucket?:    string
}

export function RegionChartSection({
  history,
  allPredictions,
  initialHorizon,
  sggCode,
  areaBucket,
}: Props) {
  const [horizon, setHorizon] = useState<HorizonVal>(initialHorizon)

  function handleHorizon(h: HorizonVal) {
    setHorizon(h)
    // URL 동기화 (페이지 reload 없이)
    const p = new URLSearchParams(window.location.search)
    if (areaBucket) p.set('area_bucket', areaBucket)
    else p.delete('area_bucket')
    if (h !== 6) p.set('horizon', String(h))
    else p.delete('horizon')
    const qs = p.toString()
    window.history.replaceState(
      null,
      '',
      `/invest/region/${sggCode}${qs ? `?${qs}` : ''}`,
    )
  }

  const opt = HORIZON_OPTIONS.find(o => o.value === horizon) ?? HORIZON_OPTIONS[1]!
  // 버튼마다 히스토리 창 크기가 달라서 차트가 시각적으로 변화함
  const displayHistory = history.slice(-opt.historyMonths)
  const displayPredictions = allPredictions.slice(0, horizon)

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    font: '500 12px/1.4 var(--font-sans)',
    background: active ? 'var(--dj-orange)' : 'var(--bg-surface-2)',
    color: active ? '#fff' : 'var(--fg-sec)',
    border: '1px solid var(--line-subtle)',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s, color 0.15s',
  })

  const predLabel = horizon >= 12 ? '1년' : `${horizon}개월`

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8,
      }}>
        <h2 style={{ font: '600 14px/1.4 var(--font-sans)', margin: 0, color: 'var(--fg-pri)' }}>
          시세 흐름 + {predLabel} 예측
        </h2>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginRight: 2 }}>
            예측 기간
          </span>
          {HORIZON_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => handleHorizon(o.value)}
              style={tabStyle(horizon === o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {history.length < 2 ? (
        <div style={{
          padding: '32px 0', textAlign: 'center',
          color: 'var(--fg-tertiary)', font: '500 13px/1.4 var(--font-sans)',
        }}>
          거래 데이터 부족
        </div>
      ) : (
        <RegionalPriceChartWrapper
          data={displayHistory}
          title=""
          predictionData={displayPredictions.length > 0 ? displayPredictions : undefined}
        />
      )}

      {horizon === 12 && allPredictions.length < 12 && (
        <p style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '8px 0 0' }}>
          ※ AI 예측은 현재 최대 6개월까지 제공됩니다 (Chronos 배치 주기).
          &nbsp;히스토리는 최근 36개월을 표시합니다.
        </p>
      )}
    </div>
  )
}
