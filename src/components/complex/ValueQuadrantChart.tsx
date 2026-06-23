'use client'

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'

export interface QuadrantPoint {
  complexId: string
  complexName: string
  x: number
  y: number
  isTarget: boolean
}

interface ValueQuadrantChartProps {
  data: QuadrantPoint[]
  medianX: number
  medianY: number
  regionLabel: string
  totalCount: number
}

type Quadrant = '가성비' | '프리미엄' | '주의' | '고위험'

const Q_META: Record<Quadrant, { color: string; bg: string; fill: string; desc: string }> = {
  '가성비':   { color: '#15803d', bg: '#dcfce7', fill: '#dcfce7', desc: '평당가 낮고 전세가율 높음 — 실거주·투자 모두 유리' },
  '프리미엄': { color: '#2563eb', bg: '#dbeafe', fill: '#dbeafe', desc: '평당가 높지만 전세가율도 높아 안정적인 고가 단지' },
  '주의':     { color: '#b45309', bg: '#fef3c7', fill: '#fef9c3', desc: '저렴하지만 전세가율 낮아 갭 투자 위험 있음' },
  '고위험':   { color: '#dc2626', bg: '#fee2e2', fill: '#fee2e2', desc: '평당가 높은데 전세가율 낮아 가격 부담 큼' },
}

function classifyQuadrant(x: number, y: number, mx: number, my: number): Quadrant {
  if (x <= mx && y >= my) return '가성비'
  if (x > mx && y >= my) return '프리미엄'
  if (x <= mx && y < my) return '주의'
  return '고위험'
}

export function ValueQuadrantChart({ data, medianX, medianY, regionLabel, totalCount }: ValueQuadrantChartProps) {
  const validPoints = data.filter(p => p.x > 0 && p.y >= 0)

  if (validPoints.length < 3) {
    return (
      <div style={{ display: 'flex', height: 280, alignItems: 'center', justifyContent: 'center', font: '500 13px/1.6 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
        이 지역 단지 데이터가 부족하여 차트를 표시할 수 없습니다.
      </div>
    )
  }

  const backgroundPoints = validPoints.filter(p => !p.isTarget)
  const targetPoints = validPoints.filter(p => p.isTarget)

  // 축 범위 명시적 계산 — Recharts 'auto'는 0 포함 가능성 있음
  const xVals = validPoints.map(p => p.x)
  const yVals = validPoints.map(p => p.y)
  const xMin = Math.min(...xVals)
  const xMax = Math.max(...xVals)
  const yMin = Math.min(...yVals)
  const yMax = Math.max(...yVals)
  const xPad = Math.max((xMax - xMin) * 0.12, 50)
  const yPad = Math.max((yMax - yMin) * 0.12, 3)
  const xDomain: [number, number] = [Math.floor(xMin - xPad), Math.ceil(xMax + xPad)]
  const yDomain: [number, number] = [Math.floor(yMin - yPad), Math.ceil(yMax + yPad)]

  const target = targetPoints[0]
  const targetQuadrant = target ? classifyQuadrant(target.x, target.y, medianX, medianY) : null
  const qMeta = targetQuadrant ? Q_META[targetQuadrant] : null

  return (
    <div className="card" style={{ padding: 24 }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <h3 style={{ font: '700 16px/1.4 var(--font-sans)', margin: 0, color: 'var(--fg-pri)' }}>
            주변 단지 대비 가격 위치
          </h3>
          {qMeta && targetQuadrant && (
            <span style={{
              font: '600 11px/1 var(--font-sans)',
              color: qMeta.color,
              background: qMeta.bg,
              padding: '3px 9px',
              borderRadius: 20,
              flexShrink: 0,
            }}>
              {targetQuadrant}
            </span>
          )}
        </div>

        {qMeta && (
          <p style={{ font: '500 12px/1.5 var(--font-sans)', color: 'var(--fg-secondary)', margin: '0 0 4px' }}>
            {qMeta.desc}
          </p>
        )}

        {!target && (
          <p style={{
            font: '500 12px/1.5 var(--font-sans)',
            color: 'var(--fg-tertiary)',
            margin: '0 0 4px',
            padding: '6px 10px',
            borderRadius: 6,
            background: 'var(--bg-surface-2)',
          }}>
            이 단지는 전세 거래 데이터가 부족하여 차트에 표시되지 않습니다.
          </p>
        )}

        <p style={{ font: '500 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
          {regionLabel} 내 {totalCount}개 단지 · X: 평당가(만원/평), Y: 전세가율(%)
        </p>
      </div>

      {/* 축 설명 바 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        marginBottom: 12,
        fontSize: 11,
        color: 'var(--fg-tertiary)',
        fontWeight: 500,
      }}>
        <div style={{ padding: '5px 10px', borderRadius: 6, background: 'var(--bg-surface-2)', textAlign: 'center' }}>
          ← 평당가 낮음 · 높음 →
        </div>
        <div style={{ padding: '5px 10px', borderRadius: 6, background: 'var(--bg-surface-2)', textAlign: 'center' }}>
          ↑ 전세가율 높음(안전) · 낮음 ↓
        </div>
      </div>

      {/* 차트 */}
      <div style={{ position: 'relative' }} role="img" aria-label={`${regionLabel} 내 단지 평당가·전세가율 분포`}>
        <p className="sr-only">현재 단지는 {regionLabel} 내 {totalCount}개 단지와 비교한 평당가×전세가율 분포입니다.</p>

        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 20, right: 16, bottom: 20, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

            {/* 4분면 배경 */}
            <ReferenceArea x1={xDomain[0]} x2={medianX} y1={medianY} y2={yDomain[1]} fill="#dcfce7" fillOpacity={0.5} />
            <ReferenceArea x1={medianX} x2={xDomain[1]} y1={medianY} y2={yDomain[1]} fill="#dbeafe" fillOpacity={0.5} />
            <ReferenceArea x1={xDomain[0]} x2={medianX} y1={yDomain[0]} y2={medianY} fill="#fef9c3" fillOpacity={0.5} />
            <ReferenceArea x1={medianX} x2={xDomain[1]} y1={yDomain[0]} y2={medianY} fill="#fee2e2" fillOpacity={0.5} />

            <XAxis
              dataKey="x"
              name="평당가"
              type="number"
              domain={xDomain}
              tickFormatter={(v: number) => `${Math.round(v)}만`}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
            />
            <YAxis
              dataKey="y"
              name="전세가율"
              type="number"
              domain={yDomain}
              tickFormatter={(v: number) => `${Math.round(v)}%`}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              width={44}
            />
            <Tooltip
              content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0]?.payload as QuadrantPoint | undefined
                if (!d) return null
                return (
                  <div style={{
                    fontSize: 12, fontFamily: 'var(--font-sans)',
                    border: '1px solid rgba(112,115,124,.22)',
                    borderRadius: 8, background: '#fff',
                    padding: '8px 12px', lineHeight: 1.6,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, color: d.isTarget ? '#ea580c' : 'var(--fg-pri)' }}>
                      {d.isTarget ? '★ ' : ''}{d.complexName}
                    </div>
                    <div style={{ color: 'var(--fg-secondary)' }}>평당가: {Math.round(d.x)}만원/평</div>
                    <div style={{ color: 'var(--fg-secondary)' }}>전세가율: {d.y.toFixed(1)}%</div>
                  </div>
                )
              }}
            />
            <ReferenceLine x={medianX} stroke="#d1d5db" strokeDasharray="4 2" strokeWidth={1.5} />
            <ReferenceLine y={medianY} stroke="#d1d5db" strokeDasharray="4 2" strokeWidth={1.5} />
            <Scatter name="배경단지" data={backgroundPoints} fill="#d1d5db" opacity={0.6} isAnimationActive={false} />
            <Scatter
              name="현재단지"
              data={targetPoints}
              isAnimationActive={false}
              shape={(props) => {
                const { cx, cy } = props as { cx?: number; cy?: number }
                if (cx === undefined || cy === undefined) return <g />
                return (
                  <g>
                    {/* 외곽 글로우 */}
                    <circle cx={cx} cy={cy} r={18} fill="#ea580c" opacity={0.15} />
                    {/* 흰 테두리 */}
                    <circle cx={cx} cy={cy} r={12} fill="white" />
                    {/* 주황 채움 */}
                    <circle cx={cx} cy={cy} r={9} fill="#ea580c" />
                    {/* 주황 링 */}
                    <circle cx={cx} cy={cy} r={12} fill="none" stroke="#ea580c" strokeWidth={2} />
                  </g>
                )
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>

        {/* 4분면 라벨 — 색상으로 구분 */}
        <div style={{ position: 'absolute', top: 24, left: 44, font: '600 10px/1 var(--font-sans)', color: '#15803d', pointerEvents: 'none' }}>가성비</div>
        <div style={{ position: 'absolute', top: 24, right: 12, font: '600 10px/1 var(--font-sans)', color: '#2563eb', pointerEvents: 'none' }}>프리미엄</div>
        <div style={{ position: 'absolute', bottom: 24, left: 44, font: '600 10px/1 var(--font-sans)', color: '#b45309', pointerEvents: 'none' }}>주의</div>
        <div style={{ position: 'absolute', bottom: 24, right: 12, font: '600 10px/1 var(--font-sans)', color: '#dc2626', pointerEvents: 'none' }}>고위험</div>
      </div>
    </div>
  )
}
