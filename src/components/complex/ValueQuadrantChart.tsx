'use client'

import { useState } from 'react'
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

const Q_META: Record<Quadrant, { color: string; bg: string; border: string; desc: string; short: string }> = {
  '가성비':   { color: '#15803d', bg: '#dcfce7', border: '#86efac', desc: '평당가 낮고 전세가율 높음 — 실거주·투자 모두 유리', short: '매수 유리' },
  '프리미엄': { color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd', desc: '평당가 높지만 전세가율도 높아 안정적인 고가 단지', short: '고가 안정' },
  '주의':     { color: '#92400e', bg: '#fef3c7', border: '#fcd34d', desc: '저렴하지만 전세가율 낮아 갭 투자 위험 있음', short: '갭 위험' },
  '고위험':   { color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5', desc: '평당가 높은데 전세가율 낮아 가격 부담 큼', short: '가격 부담' },
}

// 2×2 그리드 순서: 좌상(가성비) → 우상(프리미엄) → 좌하(주의) → 우하(고위험)
const GRID_ORDER: Quadrant[] = ['가성비', '프리미엄', '주의', '고위험']

function classifyQuadrant(x: number, y: number, mx: number, my: number): Quadrant {
  if (x <= mx && y >= my) return '가성비'
  if (x > mx && y >= my) return '프리미엄'
  if (x <= mx && y < my) return '주의'
  return '고위험'
}

// ─── 산점도 — 모바일/데스크탑 공용 ─────────────────────────────────
interface ScatterPlotProps {
  backgroundPoints: QuadrantPoint[]
  targetPoints: QuadrantPoint[]
  xDomain: [number, number]
  yDomain: [number, number]
  medianX: number
  medianY: number
  ariaLabel: string
}

function ScatterPlot({
  backgroundPoints, targetPoints,
  xDomain, yDomain, medianX, medianY, ariaLabel,
}: ScatterPlotProps) {
  return (
    <div>
      {/* 축 설명 바 */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
        marginBottom: 10, fontSize: 11, color: 'var(--fg-tertiary)', fontWeight: 500,
      }}>
        <div style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--bg-surface-2)', textAlign: 'center' }}>
          ← 평당가 낮음 · 높음 →
        </div>
        <div style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--bg-surface-2)', textAlign: 'center' }}>
          ↑ 전세가율 높음 · 낮음 ↓
        </div>
      </div>

      <div style={{ position: 'relative' }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 22, right: 14, bottom: 20, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

            {/* 사분면 배경 */}
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
              tick={{ fontSize: 10, fill: '#9ca3af' }}
            />
            <YAxis
              dataKey="y"
              name="전세가율"
              type="number"
              domain={yDomain}
              tickFormatter={(v: number) => `${Math.round(v)}%`}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              width={38}
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
                    maxWidth: 180,
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
                    <circle cx={cx} cy={cy} r={18} fill="#ea580c" opacity={0.15} />
                    <circle cx={cx} cy={cy} r={12} fill="white" />
                    <circle cx={cx} cy={cy} r={9} fill="#ea580c" />
                    <circle cx={cx} cy={cy} r={12} fill="none" stroke="#ea580c" strokeWidth={2} />
                  </g>
                )
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>

        {/* 사분면 라벨 */}
        <div style={{ position: 'absolute', top: 26, left: 46, font: '600 10px/1 var(--font-sans)', color: '#15803d', pointerEvents: 'none' }}>가성비</div>
        <div style={{ position: 'absolute', top: 26, right: 10, font: '600 10px/1 var(--font-sans)', color: '#1d4ed8', pointerEvents: 'none' }}>프리미엄</div>
        <div style={{ position: 'absolute', bottom: 26, left: 46, font: '600 10px/1 var(--font-sans)', color: '#92400e', pointerEvents: 'none' }}>주의</div>
        <div style={{ position: 'absolute', bottom: 26, right: 10, font: '600 10px/1 var(--font-sans)', color: '#b91c1c', pointerEvents: 'none' }}>고위험</div>
      </div>
    </div>
  )
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────
export function ValueQuadrantChart({ data, medianX, medianY, regionLabel, totalCount }: ValueQuadrantChartProps) {
  const [showFullChart, setShowFullChart] = useState(false)

  const validPoints = data.filter(p => p.x > 0 && p.y >= 0)

  if (validPoints.length < 3) {
    return (
      <div style={{ display: 'flex', height: 180, alignItems: 'center', justifyContent: 'center', font: '500 13px/1.6 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
        이 지역 단지 데이터가 부족하여 차트를 표시할 수 없습니다.
      </div>
    )
  }

  const backgroundPoints = validPoints.filter(p => !p.isTarget)
  const targetPoints = validPoints.filter(p => p.isTarget)

  const xVals = validPoints.map(p => p.x)
  const yVals = validPoints.map(p => p.y)
  const xMin = Math.min(...xVals), xMax = Math.max(...xVals)
  const yMin = Math.min(...yVals), yMax = Math.max(...yVals)
  const xPad = Math.max((xMax - xMin) * 0.12, 50)
  const yPad = Math.max((yMax - yMin) * 0.12, 3)
  const xDomain: [number, number] = [Math.floor(xMin - xPad), Math.ceil(xMax + xPad)]
  const yDomain: [number, number] = [Math.floor(yMin - yPad), Math.ceil(yMax + yPad)]

  const target = targetPoints[0]
  const targetQuadrant = target ? classifyQuadrant(target.x, target.y, medianX, medianY) : null
  const qMeta = targetQuadrant ? Q_META[targetQuadrant] : null

  const ariaLabel = `${regionLabel} 내 단지 평당가·전세가율 분포`

  return (
    <div>
      {/* ── 헤더 (공통) ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: 0, color: 'var(--fg-pri)' }}>
            주변 단지 대비 가격 위치
          </h3>
          {qMeta && targetQuadrant && (
            <span style={{
              font: '600 11px/1 var(--font-sans)',
              color: qMeta.color, background: qMeta.bg,
              padding: '3px 9px', borderRadius: 20, flexShrink: 0,
              border: `1px solid ${qMeta.border}`,
            }}>
              {targetQuadrant}
            </span>
          )}
        </div>
        {qMeta && (
          <p style={{ font: '500 12px/1.5 var(--font-sans)', color: 'var(--fg-secondary)', margin: '0 0 3px' }}>
            {qMeta.desc}
          </p>
        )}
        {!target && (
          <p style={{ font: '500 12px/1.5 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 3px', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-surface-2)' }}>
            이 단지는 전세 거래 데이터가 부족하여 차트에 표시되지 않습니다.
          </p>
        )}
        <p style={{ font: '500 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
          {regionLabel} 내 {totalCount}개 단지 비교
        </p>
      </div>

      {/* ── 모바일: 2×2 위치 카드 ── */}
      <div className="lg:hidden">
        {/* 사분면 위치 그리드 */}
        <div>
          <p style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', textAlign: 'center', margin: '0 0 5px' }}>
            ↑ 전세가율 높음(안전)
          </p>
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            {/* 왼쪽 축 라벨 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              writingMode: 'vertical-rl', transform: 'rotate(180deg)',
              font: '500 9px/1 var(--font-sans)', color: 'var(--fg-tertiary)',
              minWidth: 12,
            }}>
              평당가 낮음
            </div>

            {/* 2×2 그리드 */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto auto', gap: 6 }}>
              {GRID_ORDER.map((q) => {
                const meta = Q_META[q]
                const isTarget = q === targetQuadrant
                return (
                  <div
                    key={q}
                    style={{
                      borderRadius: 10,
                      background: isTarget ? meta.bg : 'var(--bg-surface-2)',
                      border: `2px solid ${isTarget ? meta.color : 'var(--line-subtle)'}`,
                      padding: '10px 10px 9px',
                      minHeight: 76,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{
                        font: `${isTarget ? '700' : '600'} 13px/1 var(--font-sans)`,
                        color: isTarget ? meta.color : 'var(--fg-sec)',
                      }}>
                        {q}
                      </span>
                      {isTarget && (
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: '#ea580c',
                          boxShadow: '0 0 0 3px rgba(234,88,12,0.18)',
                          display: 'inline-block', flexShrink: 0,
                        }} />
                      )}
                    </div>
                    <span style={{
                      font: '500 10px/1.3 var(--font-sans)',
                      color: isTarget ? meta.color : 'var(--fg-tertiary)',
                    }}>
                      {meta.short}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* 오른쪽 축 라벨 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              writingMode: 'vertical-rl',
              font: '500 9px/1 var(--font-sans)', color: 'var(--fg-tertiary)',
              minWidth: 12,
            }}>
              평당가 높음
            </div>
          </div>
          <p style={{ font: '500 10px/1 var(--font-sans)', color: 'var(--fg-tertiary)', textAlign: 'center', margin: '5px 0 0' }}>
            전세가율 낮음 ↓
          </p>
        </div>

        {/* 현재 단지 수치 상세 */}
        {target && qMeta && targetQuadrant && (
          <div style={{
            background: qMeta.bg,
            borderRadius: 8, padding: '10px 12px', marginTop: 12,
            border: `1px solid ${qMeta.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ font: '600 11px/1 var(--font-sans)', color: qMeta.color, marginBottom: 5 }}>
                이 단지의 위치
              </div>
              <div style={{ display: 'flex', gap: 14, font: '500 12px/1 var(--font-sans)', color: 'var(--fg-secondary)' }}>
                <span>평당가 <strong style={{ color: qMeta.color }}>{Math.round(target.x)}만</strong></span>
                <span>전세가율 <strong style={{ color: qMeta.color }}>{target.y.toFixed(1)}%</strong></span>
              </div>
            </div>
            <span style={{
              font: '600 11px/1 var(--font-sans)', color: qMeta.color,
              background: '#fff', border: `1px solid ${qMeta.border}`,
              borderRadius: 6, padding: '4px 8px', flexShrink: 0,
            }}>
              {targetQuadrant}
            </span>
          </div>
        )}

        {/* 전체 분포 차트 펼치기 버튼 */}
        <button
          onClick={() => setShowFullChart(v => !v)}
          style={{
            width: '100%', marginTop: 10,
            padding: '10px 12px',
            border: '1px solid var(--line-default)',
            borderRadius: 8,
            background: showFullChart ? 'var(--bg-surface-2)' : 'var(--bg-surface)',
            font: '500 12px/1 var(--font-sans)',
            color: 'var(--fg-sec)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          {showFullChart ? '차트 닫기' : `${totalCount}개 단지 분포 차트 보기`}
          <span style={{ fontSize: 9 }}>{showFullChart ? '▲' : '▼'}</span>
        </button>

        {/* 펼쳐진 산점도 */}
        {showFullChart && (
          <div style={{ marginTop: 14 }}>
            <ScatterPlot
              backgroundPoints={backgroundPoints}
              targetPoints={targetPoints}
              xDomain={xDomain}
              yDomain={yDomain}
              medianX={medianX}
              medianY={medianY}
              ariaLabel={ariaLabel}
            />
          </div>
        )}
      </div>

      {/* ── 데스크탑: 전체 산점도 ── */}
      <div className="hidden lg:block">
        <ScatterPlot
          backgroundPoints={backgroundPoints}
          targetPoints={targetPoints}
          xDomain={xDomain}
          yDomain={yDomain}
          medianX={medianX}
          medianY={medianY}
          ariaLabel={ariaLabel}
        />
      </div>
    </div>
  )
}
