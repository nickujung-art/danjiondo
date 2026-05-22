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
      {/* Nav */}
      <header
        style={{
          height: 60,
          background: '#fff',
          borderBottom: '1px solid var(--line-default)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          gap: 24,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <Link href="/" className="dj-logo">
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
        <span style={{ font: '700 16px/1.4 var(--font-sans)', letterSpacing: '-0.015em' }}>
          단지 비교
        </span>
        {validIds.length > 0 && (
          <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
            {validIds.length}개 선택
          </span>
        )}
      </header>

      {/* Body */}
      <div
        style={{
          padding: '24px 32px',
          maxWidth: 1280,
          margin: '0 auto',
        }}
      >
        {complexes.length >= 2 && <CompareChartWrapper complexes={complexes} />}
        <CompareTable complexes={complexes} />
      </div>
    </div>
  )
}
