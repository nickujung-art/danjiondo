'use client'
import { useState } from 'react'
import type { RawTransaction } from '@/lib/data/complex-detail'

const INITIAL_LIMIT = 10

function fmtPrice(manwon: number): string {
  if (manwon >= 10000) {
    const ok = Math.floor(manwon / 10000)
    const rem = manwon % 10000
    return rem > 0 ? `${ok}억 ${rem.toLocaleString()}만` : `${ok}억`
  }
  return `${manwon.toLocaleString()}만`
}

function toPyeong(m2: number): string {
  return `${(m2 / 3.3058).toFixed(0)}평`
}

interface Props {
  transactions: RawTransaction[]
}

export function RecentTransactionList({ transactions }: Props) {
  const [expanded, setExpanded] = useState(false)

  const sorted = [...transactions].sort((a, b) => b.dealDate.localeCompare(a.dealDate))
  const visible = expanded ? sorted : sorted.slice(0, INITIAL_LIMIT)

  if (sorted.length === 0) {
    return (
      <p style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
        거래 데이터가 없습니다.
      </p>
    )
  }

  return (
    <div>
      {/* 헤더 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr 80px',
        padding: '0 0 8px',
        borderBottom: '1px solid var(--line-default)',
        marginBottom: 2,
      }}>
        {['날짜', '금액', '면적'].map(h => (
          <span key={h} style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
            {h}
          </span>
        ))}
      </div>

      {/* 거래 행 */}
      {visible.map((t, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 80px',
            alignItems: 'center',
            padding: '9px 0',
            borderBottom: i < visible.length - 1 ? '1px solid var(--line-subtle)' : 'none',
          }}
        >
          <span className="tnum" style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
            {t.dealDate.slice(2, 10)}
          </span>
          <span className="tnum" style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>
            {fmtPrice(t.price)}
          </span>
          <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-sec)', textAlign: 'right' }}>
            {toPyeong(t.area)} ({t.area.toFixed(0)}㎡)
          </span>
        </div>
      ))}

      {sorted.length > INITIAL_LIMIT && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)',
            textAlign: 'center', padding: '10px 0 0', margin: 0,
            background: 'none', border: 'none', cursor: 'pointer', width: '100%',
          }}
        >
          {expanded ? '접기' : `외 ${sorted.length - INITIAL_LIMIT}건 더보기`}
        </button>
      )}
    </div>
  )
}
