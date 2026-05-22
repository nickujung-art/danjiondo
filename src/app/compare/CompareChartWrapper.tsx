'use client'
import dynamic from 'next/dynamic'
import type { ComplexSummary } from '@/lib/data/compare'

const CompareChart = dynamic(
  () => import('./CompareChart').then(m => m.CompareChart),
  { ssr: false }
)

export function CompareChartWrapper({ complexes }: { complexes: ComplexSummary[] }) {
  return <CompareChart complexes={complexes} />
}
