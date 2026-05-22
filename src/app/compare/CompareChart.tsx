'use client'
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Legend } from 'recharts'
import type { ComplexSummary } from '@/lib/data/compare'

const LINE_COLORS = ['#1d4ed8', '#b45309', '#047857', '#7c3aed']

function formatPrice(v: unknown): string {
  const n = Number(v)
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억`
  return `${n.toLocaleString()}만`
}

export function CompareChart({ complexes }: { complexes: ComplexSummary[] }) {
  const allMonths = [...new Set(
    complexes.flatMap(c => c.priceHistory.map(p => p.yearMonth))
  )].sort()

  if (allMonths.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--fg-tertiary)', font: '500 13px/1.4 var(--font-sans)' }}>
        데이터 없음
      </div>
    )
  }

  const chartData = allMonths.map(ym => {
    const row: Record<string, unknown> = { yearMonth: ym }
    for (const c of complexes) {
      const found = c.priceHistory.find(p => p.yearMonth === ym)
      if (found) row[c.id] = found.avgPrice
    }
    return row
  })

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ font: '700 15px/1.4 var(--font-sans)', margin: '0 0 16px' }}>
        실거래가 추이 (최근 1년, 매매)
      </h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="yearMonth" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(2)} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatPrice} width={56} />
          <Tooltip formatter={(v) => [formatPrice(v), '']} labelFormatter={(l) => String(l)} contentStyle={{ fontSize: 12 }} />
          <Legend formatter={(value) => complexes.find(c => c.id === value)?.canonical_name ?? value} />
          {complexes.map((c, i) => (
            <Line key={c.id} type="monotone" dataKey={c.id} stroke={LINE_COLORS[i % LINE_COLORS.length] ?? '#1d4ed8'} strokeWidth={2} dot={false} activeDot={{ r: 4 }} name={c.id} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
