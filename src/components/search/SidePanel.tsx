import { Suspense } from 'react'
import { SearchInput } from './SearchInput'
import { ComplexList } from './ComplexList'
import type { ComplexSearchResult } from '@/lib/data/complex-search'
import type { AdCampaign } from '@/lib/data/ads'

interface Props {
  query:      string
  complexes:  ComplexSearchResult[]
  inFeedAds?: AdCampaign[]
}

export function SidePanel({ query, complexes, inFeedAds = [] }: Props) {
  return (
    <aside
      style={{
        width: 320,
        flexShrink: 0,
        borderRight: '1px solid var(--line-default)',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--line-default)',
        }}
      >
        <h1
          style={{
            font: '600 13px/1.4 var(--font-sans)',
            color: 'var(--fg-tertiary)',
            margin: '0 0 8px',
            letterSpacing: '-0.01em',
          }}
        >
          단지 검색
        </h1>
        <Suspense>
          <SearchInput initialValue={query} />
        </Suspense>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <ComplexList complexes={complexes} query={query} inFeedAds={inFeedAds} />
      </div>
    </aside>
  )
}
