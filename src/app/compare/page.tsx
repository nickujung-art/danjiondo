import type { Metadata } from 'next'
import Link from 'next/link'
import { createSearchParamsCache, parseAsArrayOf, parseAsString } from 'nuqs/server'
import { createReadonlyClient } from '@/lib/supabase/readonly'
import { buildCompareIds, getCompareData } from '@/lib/data/compare'
import { CompareTable } from '@/components/complex/CompareTable'
import { CompareChartWrapper } from './CompareChartWrapper'

export const revalidate = 0

export const metadata: Metadata = {
  title: '단지 비교 — 단지온도',
  description: '최대 4개 아파트 단지를 한눈에 비교해보세요.',
}

const searchParamsCache = createSearchParamsCache({
  ids: parseAsArrayOf(parseAsString).withDefault([]),
})

interface Props {
  searchParams: Promise<Record<string, string | string[]>>
}

export default async function ComparePage({ searchParams }: Props) {
  const { ids: rawIds } = searchParamsCache.parse(await searchParams)
  const validIds = buildCompareIds(rawIds)

  const supabase = createReadonlyClient()
  const complexes = validIds.length >= 2
    ? await getCompareData(validIds, supabase)
    : []

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Body */}
      <div
        style={{
          padding: '24px 16px',
          maxWidth: 1280,
          margin: '0 auto',
          overflowX: 'auto',
        }}
      >
        {complexes.length >= 2 && <CompareChartWrapper complexes={complexes} />}
        <CompareTable complexes={complexes} />
      </div>
    </div>
  )
}
