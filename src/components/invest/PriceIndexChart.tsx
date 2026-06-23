'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

export interface PriceIndexPoint {
  yearMonth: string
  saleIdx:   number | null
  jeonseIdx: number | null
}

interface ChartRow {
  ym:        string
  regional:  number | null
  jeonse:    number | null
  national:  number | null
}

interface TooltipPayload {
  name:  string
  value: number | null
  color: string
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const reg = payload.find(p => p.name === 'regional')
  const jen = payload.find(p => p.name === 'jeonse')
  const nat = payload.find(p => p.name === 'national')
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--line-default)',
      borderRadius: 6,
      padding: '8px 12px',
      font: '500 11px/1.6 var(--font-sans)',
      color: 'var(--fg-pri)',
      minWidth: 140,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {reg?.value != null && (
        <div style={{ color: '#f97316' }}>지역 매매: {reg.value.toFixed(1)}</div>
      )}
      {jen?.value != null && (
        <div style={{ color: '#60a5fa' }}>지역 전세: {jen.value.toFixed(1)}</div>
      )}
      {nat?.value != null && (
        <div style={{ color: '#94a3b8' }}>전국 매매: {nat.value.toFixed(1)}</div>
      )}
    </div>
  )
}

interface Props {
  regional: PriceIndexPoint[]
  national: PriceIndexPoint[]
}

export function PriceIndexChart({ regional, national }: Props) {
  if (regional.length === 0) return null

  const natMap = new Map(national.map(n => [n.yearMonth, n.saleIdx]))

  const rows: ChartRow[] = regional.map(r => ({
    ym:       r.yearMonth,
    regional: r.saleIdx,
    jeonse:   r.jeonseIdx,
    national: natMap.get(r.yearMonth) ?? null,
  }))

  // Y축 범위: 전체 값 ±5
  const allVals = rows.flatMap(r =>
    [r.regional, r.jeonse, r.national].filter((v): v is number => v != null)
  )
  const minVal = allVals.length ? Math.min(...allVals) : 90
  const maxVal = allVals.length ? Math.max(...allVals) : 110
  const pad = Math.max(3, Math.round((maxVal - minVal) * 0.15))
  const yDomain = [Math.floor(minVal - pad), Math.ceil(maxVal + pad)]

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line-subtle)" vertical={false} />
        <XAxis
          dataKey="ym"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: 'var(--fg-tertiary)' }}
          tickFormatter={v => v.slice(2).replace('-', '.')}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          domain={yDomain}
          tick={{ fontSize: 10, fill: 'var(--fg-tertiary)' }}
          tickFormatter={v => String(v)}
          width={32}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={100} stroke="var(--line-default)" strokeDasharray="2 2" />
        <Line
          dataKey="national"
          name="national"
          type="monotone"
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={false}
          connectNulls
        />
        <Line
          dataKey="jeonse"
          name="jeonse"
          type="monotone"
          stroke="#60a5fa"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          dataKey="regional"
          name="regional"
          type="monotone"
          stroke="#f97316"
          strokeWidth={2.5}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
