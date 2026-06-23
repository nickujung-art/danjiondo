'use client'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { RegionalPricePoint, PredictionPoint } from '@/lib/data/invest'

// 차트 내부 전용 로컬 포맷 함수 (server-only import 금지)
function fmtPrice(v: unknown): string {
  const n = Number(v)
  if (!isFinite(n) || n === 0) return ''
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억`
  return `${n.toLocaleString()}만`
}

interface RegionalPriceChartProps {
  data:            RegionalPricePoint[]
  title:           string
  predictionData?: PredictionPoint[]
}

interface MergedPoint {
  yearMonth: string
  avgPrice?:  number
  predMean?:  number
  predLower?: number
  predUpper?: number
}

export function RegionalPriceChart({ data, title, predictionData }: RegionalPriceChartProps) {
  if (data.length < 2) {
    return (
      <div
        style={{
          padding:   '32px 0',
          textAlign: 'center',
          color:     'var(--fg-tertiary)',
          font:      '500 13px/1.4 var(--font-sans)',
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
  const gradId   = `priceGrad-${title.replace(/\s/g, '')}`

  const hasPrediction = (predictionData ?? []).length > 0

  // 실거래 + 예측 데이터 병합 (yearMonth 기준 정렬)
  const mergedData: MergedPoint[] = [
    ...data.map(d => ({
      yearMonth: d.yearMonth,
      avgPrice:  d.avgPrice,
    })),
    ...(predictionData ?? []).map(d => ({
      yearMonth: d.yearMonth,
      predMean:  d.mean,
      predLower: d.lower,
      predUpper: d.upper,
    })),
  ].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))

  // MAPE 평균 (predictionData에 trainingMape가 있으면 표시)
  const avgMape = hasPrediction
    ? (predictionData!.reduce((s, p) => s + p.trainingMape, 0) / predictionData!.length)
    : 0

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
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={mergedData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
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
            formatter={(v, name) => {
              if (name === 'avgPrice')  return [fmtPrice(v), '월평균']
              if (name === 'predMean')  return [fmtPrice(v), '예측 중위']
              if (name === 'predUpper') return [fmtPrice(v), '예측 상한']
              if (name === 'predLower') return [fmtPrice(v), '예측 하한']
              return [fmtPrice(v), String(name)]
            }}
            labelFormatter={(l) => String(l)}
            contentStyle={{ fontSize: 12 }}
          />
          {/* 실거래 영역 */}
          <Area
            type="monotone"
            dataKey="avgPrice"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
            isAnimationActive
            animationDuration={500}
            animationEasing="ease-out"
          />
          {/* 예측 점선 — predictionData가 있을 때만 */}
          {hasPrediction && (
            <Line
              type="monotone"
              dataKey="predMean"
              stroke={color}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              connectNulls
              isAnimationActive
              animationDuration={500}
              animationEasing="ease-out"
            />
          )}
          {/* 신뢰구간 상한 영역 (predUpper) */}
          {hasPrediction && (
            <Area
              type="monotone"
              dataKey="predUpper"
              stroke="none"
              fill={color}
              fillOpacity={0.08}
              connectNulls
              isAnimationActive
              animationDuration={500}
            />
          )}
          {/* 신뢰구간 하한 아래 채우기 제거 (predLower를 흰 배경으로 덮기) */}
          {hasPrediction && (
            <Area
              type="monotone"
              dataKey="predLower"
              stroke="none"
              fill="white"
              fillOpacity={1}
              connectNulls
              isAnimationActive
              animationDuration={500}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {/* MAPE 배지 */}
      {hasPrediction && (
        <p
          style={{
            font:   '400 11px/1.4 var(--font-sans)',
            color:  'var(--fg-tertiary)',
            margin: '6px 0 0',
          }}
        >
          예측 참고선 {avgMape > 0 ? `— 평균 오차 약 ${Math.round(avgMape * 100)}%` : ''}
        </p>
      )}
    </div>
  )
}
