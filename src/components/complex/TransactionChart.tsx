'use client'

import { useState } from 'react'
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { PricePoint } from '@/lib/utils/iqr'

interface Props {
  normal:   PricePoint[]
  outliers: PricePoint[]
  dealType: 'sale' | 'jeonse'
}

const LABEL: Record<'sale' | 'jeonse', string> = {
  sale:   '매매가',
  jeonse: '보증금',
}

function formatPrice(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}억`
  return `${value.toLocaleString()}만`
}

function tooltipPrice(value: unknown): [string, string] {
  const n = Number(value)
  if (!Number.isFinite(n)) return ['-', '']
  return [formatPrice(n), '']
}

function aggregateMonthlyAverage(points: PricePoint[]): Array<{ yearMonth: string; avgPrice: number }> {
  const buckets = new Map<string, number[]>()
  for (const p of points) {
    const arr = buckets.get(p.yearMonth) ?? []
    arr.push(p.price)
    buckets.set(p.yearMonth, arr)
  }
  return [...buckets.entries()]
    .map(([yearMonth, prices]) => ({
      yearMonth,
      avgPrice: Math.round(prices.reduce((s, v) => s + v, 0) / prices.length),
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
}

// 3개월 중심 이동평균 — 양 끝은 가용한 범위만 사용
function movingAverage(series: Array<{ yearMonth: string; avgPrice: number }>, window = 3) {
  const half = Math.floor(window / 2)
  return series.map((point, i) => {
    const start = Math.max(0, i - half)
    const end   = Math.min(series.length - 1, i + half)
    const slice = series.slice(start, end + 1)
    const avg   = Math.round(slice.reduce((s, p) => s + p.avgPrice, 0) / slice.length)
    return { yearMonth: point.yearMonth, avgPrice: avg }
  })
}

// 모바일 차트: 데이터 포인트당 최소 픽셀 폭 (Galaxy S20 Ultra 기준 ~380px content)
const MIN_PX_PER_POINT = 28
const MIN_CHART_WIDTH  = 380

export function TransactionChart({ normal, outliers, dealType }: Props) {
  const [smooth, setSmooth] = useState(false)

  if (normal.length === 0 && outliers.length === 0) {
    return (
      <div
        style={{
          minHeight: 240,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--fg-tertiary)',
          font: '500 13px/1.4 var(--font-sans)',
        }}
      >
        거래 데이터가 없습니다
      </div>
    )
  }

  const rawAvg    = aggregateMonthlyAverage(normal)
  const avgSeries = smooth ? movingAverage(rawAvg) : rawAvg

  const normalDots  = normal.map(p => ({ yearMonth: p.yearMonth, price: p.price }))
  const outlierDots = outliers.map(p => ({ yearMonth: p.yearMonth, price: p.price }))

  // 데이터 포인트 수 기준으로 모바일 스크롤 폭 계산
  const dataPointCount = avgSeries.length
  const chartMinWidth  = Math.max(MIN_CHART_WIDTH, dataPointCount * MIN_PX_PER_POINT)
  const needsScroll    = dataPointCount > 12

  const chartContent = (
    <ComposedChart margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
      <XAxis
        dataKey="yearMonth"
        type="category"
        allowDuplicatedCategory={false}
        tick={{ fontSize: 11 }}
        tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(2) : '')}
        interval={needsScroll ? 2 : 'preserveStartEnd'}
      />
      <YAxis
        tick={{ fontSize: 11 }}
        tickFormatter={formatPrice}
        width={60}
      />
      <Tooltip
        formatter={tooltipPrice}
        labelFormatter={(label) => String(label)}
        contentStyle={{ fontSize: 12, maxWidth: 180 }}
      />

      {/* 일반 보기: 정상 거래 점 */}
      {!smooth && (
        <Scatter
          name={LABEL[dealType]}
          data={normalDots}
          dataKey="price"
          fill="#1d4ed8"
          shape="circle"
        />
      )}

      {/* 일반 보기: 이상치 점 */}
      {!smooth && (
        <Scatter
          name="이상 거래 의심 (분기 IQR 기준)"
          data={outlierDots}
          dataKey="price"
          fill="transparent"
          stroke="#9ca3af"
          opacity={0.4}
          shape="circle"
        />
      )}

      {/* 평균/추세선 */}
      <Line
        type="monotone"
        dataKey="avgPrice"
        data={avgSeries}
        stroke="#1d4ed8"
        strokeWidth={smooth ? 2.5 : 2}
        dot={{ r: 2, fill: '#1d4ed8' }}
        activeDot={{ r: 5 }}
        name={smooth ? '이동평균 추세선' : '월평균 (이상치 제외)'}
      />
    </ComposedChart>
  )

  return (
    <div style={{ position: 'relative' }}>
      {/* 토글 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button
          onClick={() => setSmooth(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 10px',
            borderRadius: 20,
            border: `1px solid ${smooth ? '#1d4ed8' : 'var(--line-default)'}`,
            background: smooth ? '#eff6ff' : 'transparent',
            color: smooth ? '#1d4ed8' : 'var(--fg-secondary)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path
              d="M1 10 C3 10 3 3 6.5 6.5 C10 10 10 3 12 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
          추세선
        </button>
      </div>

      {/* 모바일 수평 스크롤: 12개 초과 데이터 포인트 시 활성화 */}
      <div className="chart-scroll">
        <div style={{ minWidth: needsScroll ? chartMinWidth : undefined }}>
          <ResponsiveContainer width="100%" height={240}>
            {chartContent}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
