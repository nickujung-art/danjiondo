'use client'

import dynamic from 'next/dynamic'
import type { RegionalPricePoint } from '@/lib/data/invest'

// 차트 내부 전용 로컬 포맷 함수 (server-only import 금지)
function fmtPrice(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}억`
  return `${v.toLocaleString()}만`
}

const SparklineChart = dynamic(
  () => import('./SparklineChart').then(m => m.SparklineChart),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height:         80,
          background:     'var(--bg-surface-2)',
          borderRadius:   4,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ font: '400 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
          로딩 중…
        </span>
      </div>
    ),
  },
)

export interface ComplexSparklineItem {
  complexId:   string
  complexName: string
  si:          string | null
  gu:          string | null
  gapRatio:    number
  riskLevel:   'safe' | 'caution' | 'danger'
  history:     RegionalPricePoint[]
}

interface Props {
  items: ComplexSparklineItem[]
}

const RISK_COLOR: Record<string, string> = {
  safe:    '#16a34a',
  caution: '#d97706',
  danger:  '#dc2626',
}

export function TopComplexSparklines({ items }: Props) {
  if (items.length === 0) {
    return (
      <div
        style={{
          padding:   '32px 0',
          textAlign: 'center',
          font:      '500 13px/1.4 var(--font-sans)',
          color:     'var(--fg-tertiary)',
        }}
      >
        갭랭킹 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div
      style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap:                 12,
      }}
    >
      {items.map((item) => {
        const last      = item.history[item.history.length - 1]?.avgPrice ?? null
        const riskColor = RISK_COLOR[item.riskLevel] ?? RISK_COLOR['caution']

        return (
          <a
            key={item.complexId}
            href={`/complexes/${item.complexId}`}
            style={{
              display:        'block',
              padding:        '12px 14px',
              background:     'var(--bg-surface)',
              border:         '1px solid var(--line-subtle)',
              borderRadius:   8,
              textDecoration: 'none',
            }}
          >
            {/* 단지명 + 위치 */}
            <div style={{ marginBottom: 6 }}>
              <span
                style={{
                  font:  '600 13px/1.3 var(--font-sans)',
                  color: 'var(--fg-pri)',
                }}
              >
                {item.complexName}
              </span>
              {(item.si ?? item.gu) && (
                <span
                  style={{
                    font:       '400 11px/1 var(--font-sans)',
                    color:      'var(--fg-tertiary)',
                    marginLeft: 6,
                  }}
                >
                  {[item.si, item.gu].filter(Boolean).join(' ')}
                </span>
              )}
            </div>

            {/* 최근 실거래가 + 갭 비율 */}
            <div
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                marginBottom:   8,
              }}
            >
              <span
                style={{
                  font:  '700 14px/1 var(--font-sans)',
                  color: 'var(--fg-pri)',
                }}
              >
                {last !== null ? fmtPrice(last) : '—'}
              </span>
              <span
                style={{
                  font:    '600 12px/1 var(--font-sans)',
                  color:   riskColor,
                  padding: '2px 7px',
                  border:  `1px solid ${riskColor}`,
                  borderRadius: 4,
                }}
              >
                갭 {item.gapRatio.toFixed(1)}%
              </span>
            </div>

            {/* 스파크라인 */}
            {item.history.length >= 2 ? (
              <SparklineChart data={item.history} riskLevel={item.riskLevel} />
            ) : (
              <div
                style={{
                  height:    60,
                  display:   'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  font:      '400 11px/1 var(--font-sans)',
                  color:     'var(--fg-tertiary)',
                }}
              >
                거래 이력 부족
              </div>
            )}
          </a>
        )
      })}
    </div>
  )
}
