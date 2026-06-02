'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { MortgageRatePoint } from '@/lib/data/invest'

interface Props {
  data: MortgageRatePoint[]
}

export function RateSparkline({ data }: Props) {
  if (data.length < 2) return null

  const rates  = data.map(d => d.rate)
  const minVal = Math.min(...rates)
  const maxVal = Math.max(...rates)
  const latest = data[data.length - 1]!
  const oldest = data[0]!
  const delta  = latest.rate - oldest.rate

  // 구간 하이라이트 색상: 최근이 높으면 빨강, 낮으면 초록
  const lineColor = delta > 0 ? '#dc2626' : '#16a34a'

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>현재</span>
          <span className="tnum" style={{ font: '700 18px/1 var(--font-sans)', color: lineColor, marginLeft: 6 }}>
            {latest.rate.toFixed(2)}%
          </span>
        </div>
        <div>
          <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
            {data.length}개월 변동
          </span>
          <span className="tnum" style={{
            font: '600 14px/1 var(--font-sans)',
            color: delta > 0 ? '#dc2626' : '#16a34a',
            marginLeft: 6,
          }}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(2)}%p
          </span>
        </div>
        <div>
          <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>구간 범위</span>
          <span className="tnum" style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)', marginLeft: 6 }}>
            {minVal.toFixed(2)}–{maxVal.toFixed(2)}%
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="yearMonth"
            tick={{ fontSize: 10 }}
            tickFormatter={(v: string) => v.slice(2)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            width={42}
            domain={[
              (dMin: number) => Math.floor((dMin - 0.1) * 4) / 4,
              (dMax: number) => Math.ceil((dMax + 0.1) * 4) / 4,
            ]}
          />
          <Tooltip
            formatter={(v) => [`${Number(v).toFixed(2)}%`, '주담대 금리']}
            labelFormatter={(l) => String(l)}
            contentStyle={{ fontSize: 11 }}
          />
          <ReferenceLine y={latest.rate} stroke={lineColor} strokeDasharray="3 3" strokeOpacity={0.4} />
          <Line
            type="monotone"
            dataKey="rate"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
