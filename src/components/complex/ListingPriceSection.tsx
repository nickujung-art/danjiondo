'use client'

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { ListingPricePoint } from '@/lib/data/listing-history'

interface TxPricePoint {
  yearMonth: string    // 'YYYY-MM'
  price:     number    // 만원
  area:      number    // m²
}

interface MergedPoint {
  yearMonth:  string
  listingPy?: number   // 호가 평당가 (만원)
  txPy?:      number   // 실거래 평당가 월평균 (만원)
}

interface Props {
  listingHistory: ListingPricePoint[]   // from listing_prices source='naver'
  rawSaleData:    TxPricePoint[]        // from getComplexRawTransactions 'sale'
}

/**
 * 호가(listing) + 실거래(tx) 병합 데이터 생성
 * RESEARCH.md §5.3
 */
function mergeData(listingHistory: ListingPricePoint[], rawSaleData: TxPricePoint[]): MergedPoint[] {
  // 호가: recorded_date(YYYY-MM-DD) → yearMonth(YYYY-MM)
  const listingByYm: Record<string, number> = {}
  for (const p of listingHistory) {
    const ym = p.recorded_date.slice(0, 7)
    // 같은 월 여러 건이면 최신값 유지 (오름차순 정렬이므로 마지막 값)
    listingByYm[ym] = p.price_per_py
  }

  // 실거래: 월별 평균 평당가
  const txByYm: Record<string, number[]> = {}
  for (const t of rawSaleData) {
    const py = t.area > 0 ? Math.round(t.price / (t.area / 3.3058)) : null
    if (!py || py < 100 || py > 99999) continue
    if (!txByYm[t.yearMonth]) txByYm[t.yearMonth] = []
    txByYm[t.yearMonth]!.push(py)
  }
  const txAvgByYm: Record<string, number> = {}
  for (const [ym, prices] of Object.entries(txByYm)) {
    txAvgByYm[ym] = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length)
  }

  // 월 집합: 호가 + 실거래 합집합
  const allYm = Array.from(new Set([...Object.keys(listingByYm), ...Object.keys(txAvgByYm)])).sort()

  return allYm.map(ym => ({
    yearMonth:  ym,
    listingPy:  listingByYm[ym],
    txPy:       txAvgByYm[ym],
  }))
}

function formatPy(value: number): string {
  return `${value.toLocaleString()}만`
}

export function ListingPriceSection({ listingHistory, rawSaleData }: Props) {
  // RESEARCH.md §6 Pitfall 5: 양쪽 데이터 중 하나라도 없으면 섹션 숨김
  // (page.tsx에서 listingHistory.length === 0 이면 렌더하지 않음)
  const data = mergeData(listingHistory, rawSaleData)

  if (data.length === 0) return null

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line-subtle)" />
          <XAxis
            dataKey="yearMonth"
            tick={{ fontSize: 11, fill: 'var(--fg-tertiary)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--fg-tertiary)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatPy}
            width={60}
          />
          <Tooltip
            formatter={(v) => {
              if (typeof v === 'number') return [`${v.toLocaleString()}만원/평`]
              return [`${String(v ?? '')}만원/평`]
            }}
            labelStyle={{ fontSize: 11 }}
            contentStyle={{ fontSize: 12, border: '1px solid var(--line-default)' }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          {/* 호가 평당가 — 주황 실선 */}
          <Line
            dataKey="listingPy"
            stroke="#ea580c"
            name="호가(평당)"
            dot={false}
            connectNulls
            strokeWidth={2}
          />
          {/* 실거래 평당가 — 파랑 점선 */}
          <Line
            dataKey="txPy"
            stroke="#1d4ed8"
            name="실거래(평당)"
            dot={false}
            connectNulls
            strokeDasharray="4 2"
            strokeWidth={2}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
