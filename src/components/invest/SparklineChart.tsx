'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { RegionalPricePoint } from '@/lib/data/invest'

function fmtPrice(v: unknown): string {
  const n = Number(v)
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억`
  return `${n.toLocaleString()}만`
}

const RISK_COLOR: Record<string, string> = {
  safe:    '#16a34a',
  caution: '#d97706',
  danger:  '#dc2626',
}

interface Props {
  data:      RegionalPricePoint[]
  riskLevel: string
}

export function SparklineChart({ data, riskLevel }: Props) {
  const color = RISK_COLOR[riskLevel] ?? '#888'

  return (
    <ResponsiveContainer width="100%" height={60}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <XAxis dataKey="yearMonth" hide />
        <YAxis hide domain={['auto', 'auto']} />
        <Tooltip
          formatter={(v) => [fmtPrice(v), '월평균']}
          labelFormatter={(l) => String(l)}
          contentStyle={{ fontSize: 11 }}
        />
        <Line
          type="monotone"
          dataKey="avgPrice"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
