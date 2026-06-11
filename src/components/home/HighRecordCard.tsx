// src/components/home/HighRecordCard.tsx
import Link from 'next/link'
import type { RecentHighRecord } from '@/lib/data/homepage'
import { formatPrice, formatPyeong, formatDealDate, complexHref } from '@/lib/format'

interface Props {
  record: RecentHighRecord
}

function FireIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 1 1 2 2 2 0-3-1-5 1-8z" />
    </svg>
  )
}

export function HighRecordCard({ record }: Props) {
  const loc = [record.complex.si, record.complex.gu, record.complex.dong]
    .filter(Boolean)
    .join(' ')

  return (
    <Link
      href={complexHref(record.complex.id, record.complex.status === 'active' ? record.complex.url_slug : null)}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div className="card" style={{ padding: 20, cursor: 'pointer', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span className="badge orange">
            <FireIcon />
            신고가
          </span>
          <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)', marginLeft: 'auto' }}>
            {formatDealDate(record.deal_date)}
          </span>
        </div>
        <div style={{ font: '700 16px/1.35 var(--font-sans)', letterSpacing: '-0.012em', marginBottom: 2 }}>
          {record.complex.canonical_name}
        </div>
        <div style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 14 }}>
          {loc} · {formatPyeong(record.area_m2)}
        </div>
        <div className="tnum" style={{ font: '700 22px/1 var(--font-sans)', letterSpacing: '-0.02em' }}>
          {formatPrice(record.price)}
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-sec)', marginLeft: 2 }}>만원</span>
        </div>
      </div>
    </Link>
  )
}
