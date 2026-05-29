'use client'

import dynamic from 'next/dynamic'
import type { RegionalPricePoint } from '@/lib/data/invest'

const ComplexPriceChart = dynamic(
  () => import('./ComplexPriceChart').then(m => m.ComplexPriceChart),
  {
    ssr:     false,
    loading: () => (
      <div
        style={{
          height:          220,
          background:      'var(--bg-surface-2)',
          borderRadius:    6,
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
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
  data:  RegionalPricePoint[]
  title: string
}

export function ComplexPriceChartWrapper({ data, title }: Props) {
  return <ComplexPriceChart data={data} title={title} />
}
