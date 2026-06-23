'use client'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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

  const maxTx = Math.max(...data.map(d => d.txCount), 1)

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
      {/* 가격 추이 */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} syncId="complexPrice" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="yearMonth" hide />
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

      {/* 거래량 바 */}
      <ResponsiveContainer width="100%" height={42}>
        <BarChart data={data} syncId="complexPrice" margin={{ top: 2, right: 16, left: 8, bottom: 0 }}>
          <XAxis
            dataKey="yearMonth"
            tick={{ fontSize: 10 }}
            tickFormatter={(v: string) => v.slice(2)}
            interval="preserveStartEnd"
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, maxTx * 2]} />
          <Tooltip
            formatter={(v) => [`${v}건`, '거래량']}
            labelFormatter={(l) => String(l)}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="txCount" radius={[2, 2, 0, 0]} maxBarSize={14}>
            {data.map((_, i) => (
              <Cell key={i} fill={color} opacity={0.35} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
