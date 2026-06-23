'use client'

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { PopulationPoint } from '@/lib/data/invest'

interface ChartRow {
  year:   number
  pop:    number   // 명
  yoyPct: number | null  // 전년比 %
}

function buildRows(data: PopulationPoint[]): ChartRow[] {
  return data.map((d, i) => {
    const prev = i > 0 ? data[i - 1] : null
    const yoyPct =
      prev && prev.population > 0
        ? ((d.population - prev.population) / prev.population) * 100
        : null
    return { year: d.year, pop: d.population, yoyPct: yoyPct ? Math.round(yoyPct * 10) / 10 : null }
  })
}

interface TooltipPayloadItem {
  name: string
  value: number
  color: string
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: number
}) {
  if (!active || !payload?.length) return null
  const pop  = payload.find(p => p.name === 'pop')
  const yoy  = payload.find(p => p.name === 'yoyPct')
  return (
    <div style={{
      background: 'var(--bg-surface-1)',
      border: '1px solid var(--line-default)',
      borderRadius: 6,
      padding: '8px 12px',
      font: '500 12px/1.5 var(--font-sans)',
      color: 'var(--fg-pri)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}년</div>
      {pop && (
        <div>인구: {Number(pop.value).toLocaleString('ko-KR')}명</div>
      )}
      {yoy && yoy.value != null && (
        <div style={{ color: yoy.value < 0 ? '#dc2626' : yoy.value > 0 ? '#16a34a' : 'var(--fg-tertiary)' }}>
          전년比: {yoy.value >= 0 ? '+' : ''}{yoy.value}%
        </div>
      )}
    </div>
  )
}

export function PopulationChart({ data }: { data: PopulationPoint[] }) {
  if (data.length === 0) return null
  const rows = buildRows(data)

  const minPop = Math.min(...rows.map(r => r.pop))
  const maxPop = Math.max(...rows.map(r => r.pop))
  const margin = Math.round((maxPop - minPop) * 0.15) || 10000
  const yDomain = [Math.max(0, minPop - margin), maxPop + margin]

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line-subtle)" vertical={false} />
        <XAxis
          dataKey="year"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: 'var(--fg-tertiary)' }}
          tickFormatter={v => `'${String(v).slice(2)}`}
        />
        <YAxis
          yAxisId="pop"
          orientation="left"
          tickLine={false}
          axisLine={false}
          domain={yDomain}
          tick={{ fontSize: 10, fill: 'var(--fg-tertiary)' }}
          tickFormatter={v => `${Math.round(v / 1000)}k`}
          width={36}
        />
        <YAxis
          yAxisId="yoy"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: 'var(--fg-tertiary)' }}
          tickFormatter={v => `${v}%`}
          width={36}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine yAxisId="yoy" y={0} stroke="var(--line-default)" strokeDasharray="2 2" />
        <Bar
          yAxisId="pop"
          dataKey="pop"
          name="pop"
          fill="#60a5fa"
          opacity={0.6}
          radius={[2, 2, 0, 0]}
          maxBarSize={32}
        />
        <Line
          yAxisId="yoy"
          dataKey="yoyPct"
          name="yoyPct"
          type="monotone"
          stroke="#f97316"
          strokeWidth={2}
          dot={{ r: 3, fill: '#f97316', strokeWidth: 0 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
