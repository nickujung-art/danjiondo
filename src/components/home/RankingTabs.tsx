'use client'

// src/components/home/RankingTabs.tsx
import { useState } from 'react'
import Link from 'next/link'
import type { RankType, RankingRow } from '@/lib/data/rankings'
import { formatPrice } from '@/lib/format'

interface Props {
  initialData: Record<RankType, RankingRow[]>
}

const TAB_LABELS: Record<RankType, string> = {
  high_price: '신고가 TOP',
  volume: '거래량',
  price_per_pyeong: '평당가',
  interest: '관심도',
}

function ArrUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m6 14 6-6 6 6" />
    </svg>
  )
}

function formatScore(rankType: RankType, score: number): string {
  if (rankType === 'high_price') return formatPrice(score)
  if (rankType === 'price_per_pyeong') return `${Math.round(score).toLocaleString()}만/평`
  if (rankType === 'volume') return `${score}건`
  return `${score}명` // interest
}

function formatAreaM2(m2: number): string {
  return `${Math.round(m2)}㎡`
}

function formatPyeong(m2: number): string {
  return `${(m2 / 3.3058).toFixed(1)}평`
}

export function RankingTabs({ initialData }: Props) {
  const [activeTab, setActiveTab] = useState<RankType>('high_price')
  const rows = initialData[activeTab] ?? []

  return (
    <div>
      {/* 탭 헤더 */}
      <div className="flex flex-col gap-1 mb-3">
        <div className="tabs" style={{ border: 'none' }}>
          {(Object.keys(TAB_LABELS) as RankType[]).map((tab) => (
            <button
              key={tab}
              className="tab"
              data-orange-active={activeTab === tab ? 'true' : undefined}
              style={{ background: 'none' }}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
          매매 기준 · 최근 30일
        </span>
      </div>

      {/* 랭킹 목록 */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8"
        style={{ borderTop: '1px solid var(--line-default)' }}
      >
        {rows.length > 0 ? (
          rows.map((r) => {
            const href = activeTab === 'high_price' && r.area_m2
              ? `/complexes/${r.id}?area=${Math.round(r.area_m2)}`
              : `/complexes/${r.id}`
            return (
              <Link
                key={r.id}
                href={href}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '14px 0',
                    borderBottom: '1px solid var(--line-subtle)',
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      font: '700 14px/1 var(--font-sans)',
                      color: r.rank <= 3 ? 'var(--dj-orange)' : 'var(--fg-tertiary)',
                      flexShrink: 0,
                    }}
                  >
                    {r.rank}
                  </span>
                  <span style={{ flex: 1, font: '600 14px/1 var(--font-sans)', minWidth: 0 }}>
                    {r.canonical_name}
                    {activeTab === 'high_price' && r.area_m2 && (
                      <span
                        title={formatPyeong(r.area_m2)}
                        style={{
                          marginLeft: 5,
                          font: '500 11px/1 var(--font-sans)',
                          color: 'var(--fg-tertiary)',
                          cursor: 'default',
                        }}
                      >
                        {formatAreaM2(r.area_m2)}
                      </span>
                    )}
                  </span>
                  {r.rank <= 3 && (
                    <span style={{ display: 'flex', alignItems: 'center', color: 'var(--dj-orange)' }}>
                      <ArrUpIcon />
                    </span>
                  )}
                  <span
                    className="tnum"
                    style={{
                      font: '500 13px/1 var(--font-sans)',
                      color: 'var(--fg-sec)',
                      minWidth: 80,
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {formatScore(activeTab, r.score)}
                  </span>
                </div>
              </Link>
            )
          })
        ) : (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '32px 0',
              textAlign: 'center',
              color: 'var(--fg-tertiary)',
              font: '500 14px/1 var(--font-sans)',
            }}
          >
            랭킹 데이터를 불러오는 중입니다.
          </div>
        )}
      </div>
    </div>
  )
}
