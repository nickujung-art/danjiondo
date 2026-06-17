'use client'

import dynamic from 'next/dynamic'
import type { ListingPricePoint } from '@/lib/data/listing-history'

interface TxPricePoint {
  yearMonth: string
  price:     number
  area:      number
}

const ListingPriceSectionInner = dynamic(
  () => import('./ListingPriceSection').then(m => m.ListingPriceSection),
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
        <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
          차트 로딩 중…
        </span>
      </div>
    ),
  },
)

interface Props {
  listingHistory: ListingPricePoint[]
  rawSaleData:    TxPricePoint[]
}

export function ListingPriceSectionWrapper({ listingHistory, rawSaleData }: Props) {
  return <ListingPriceSectionInner listingHistory={listingHistory} rawSaleData={rawSaleData} />
}
