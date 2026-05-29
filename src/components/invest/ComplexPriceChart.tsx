'use client'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { RegionalPricePoint } from '@/lib/data/invest'

// 차트 내부 전용 로컬 포맷 함수 (server-only import 금지)
function fmtPrice(v: unknown): string {
  const n = Number(v)
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억`
  return `${n.toLocaleString()}만`
}

interface ComplexPriceChartProps {
  data:  RegionalPricePoint[]
  title: string
}

export function ComplexPriceChart({ data, title }: ComplexPriceChartProps) {
  if (data.length < 2) {
    return (
      <div
        style={{
          padding: '32px 0',
          textAlign: 'center',
          color: 'var(--fg-tertiary)',
          font: '500 13px/1.4 var(--font-sans)',
        }}
      >
        데이터가 부족합니다 (거래 3건 미만)
      </div>
    )
  }

  const first    = data[0]?.avgPrice ?? 0
  const last     = data[data.length - 1]?.avgPrice ?? 0
  const isRising = last >= first
  const color    = isRising ? '#16a34a' : '#dc2626'
  const gradId   = `complexPriceGrad-${title.replace(/\s/g, '')}`

  return (
    <div>
      {title && (
        <p
          style={{
            font:   '500 12px/1.5 var(--font-sans)',
            color:  'var(--fg-tertiary)',
            margin: '0 0 8px',
          }}
        >
          {title}
        </p>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="yearMonth"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(2)}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtPrice} width={60} />
          <Tooltip
            formatter={(v) => [fmtPrice(v), '월평균']}
            labelFormatter={(l) => String(l)}
            contentStyle={{ fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="avgPrice"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
