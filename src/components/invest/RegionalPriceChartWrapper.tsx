'use client'

import dynamic from 'next/dynamic'
import type { RegionalPricePoint, PredictionPoint } from '@/lib/data/invest'

const RegionalPriceChart = dynamic(
  () => import('./RegionalPriceChart').then(m => m.RegionalPriceChart),
  {
    ssr:     false,
    loading: () => (
      <div
        style={{
          height:         220,
          background:     'var(--bg-surface-2)',
          borderRadius:   6,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            font:  '500 12px/1 var(--font-sans)',
            color: 'var(--fg-tertiary)',
          }}
        >
          차트 로딩 중…
        </span>
      </div>
    ),
  },
)

interface Props {
  data:            RegionalPricePoint[]
  title:           string
  predictionData?: PredictionPoint[]
}

export function RegionalPriceChartWrapper({ data, title, predictionData }: Props) {
  return <RegionalPriceChart data={data} title={title} predictionData={predictionData} />
}
