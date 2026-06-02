'use client'

import dynamic from 'next/dynamic'
import type { MortgageRatePoint } from '@/lib/data/invest'

const RateSparkline = dynamic(
  () => import('./RateSparkline').then(m => m.RateSparkline),
  { ssr: false, loading: () => <div style={{ height: 130 }} /> },
)

export function RateSparklineWrapper({ data }: { data: MortgageRatePoint[] }) {
  return <RateSparkline data={data} />
}
