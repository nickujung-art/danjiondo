'use client'
import { useState } from 'react'
import { createPortal } from 'react-dom'
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

function TransactionRow({ t, last }: { t: RawTransaction; last: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr 80px',
        alignItems: 'center',
        padding: '9px 0',
        borderBottom: last ? 'none' : '1px solid var(--line-subtle)',
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
  )
}

function AllTransactionsSheet({ transactions, onClose }: { transactions: RawTransaction[]; onClose: () => void }) {
  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-surface)',
        borderRadius: '20px 20px 0 0',
        zIndex: 201,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        paddingBottom: 'env(safe-area-inset-bottom, 20px)',
      }}>
        {/* 드래그 핸들 */}
        <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--line-default)' }} />
        </div>

        {/* 헤더 */}
        <div style={{
          padding: '12px 20px 14px',
          borderBottom: '1px solid var(--line-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ font: '700 16px/1 var(--font-sans)', margin: '0 0 4px', color: 'var(--fg-pri)' }}>
              실거래 내역
            </h2>
            <p style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
              총 {transactions.length}건
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32,
              display: 'grid', placeItems: 'center',
              border: 'none', background: 'var(--bg-surface-2)',
              borderRadius: 8, cursor: 'pointer',
              color: 'var(--fg-sec)', font: '500 18px/1 var(--font-sans)',
            }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* 컬럼 헤더 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 80px',
          padding: '8px 20px',
          borderBottom: '1px solid var(--line-default)',
          flexShrink: 0,
        }}>
          {['날짜', '금액', '면적'].map(h => (
            <span key={h} style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
              {h}
            </span>
          ))}
        </div>

        {/* 스크롤 목록 */}
        <div style={{ overflowY: 'auto', padding: '0 20px' }}>
          {transactions.map((t, i) => (
            <TransactionRow key={i} t={t} last={i === transactions.length - 1} />
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}

interface Props {
  transactions: RawTransaction[]
}

export function RecentTransactionList({ transactions }: Props) {
  const [open, setOpen] = useState(false)

  const sorted = [...transactions].sort((a, b) => b.dealDate.localeCompare(a.dealDate))
  const visible = sorted.slice(0, INITIAL_LIMIT)
  const extra   = sorted.length - INITIAL_LIMIT

  if (sorted.length === 0) {
    return (
      <p style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
        거래 데이터가 없습니다.
      </p>
    )
  }

  return (
    <div>
      {/* 컬럼 헤더 */}
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

      {/* 최근 10건 */}
      {visible.map((t, i) => (
        <TransactionRow key={i} t={t} last={i === visible.length - 1 && extra <= 0} />
      ))}

      {/* 더보기 → 바텀시트 */}
      {extra > 0 && (
        <button
          onClick={() => setOpen(true)}
          style={{
            width: '100%',
            marginTop: 10,
            padding: '9px 0',
            borderRadius: 8,
            border: '1px solid var(--line-default)',
            background: 'var(--bg-surface)',
            color: 'var(--fg-sec)',
            font: '500 12px/1 var(--font-sans)',
            cursor: 'pointer',
          }}
        >
          외 {extra}건 더보기
        </button>
      )}

      {open && <AllTransactionsSheet transactions={sorted} onClose={() => setOpen(false)} />}
    </div>
  )
}
