import type { NearbyComplex } from '@/lib/data/nearby-compare'
import Link from 'next/link'

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}

interface Props {
  current: { name: string; avgPricePerPy: number | null }
  nearby:  NearbyComplex[]
}

export function NearbyCompareCard({ current, nearby }: Props) {
  if (nearby.length === 0) return null

  const allPrices = [
    ...(current.avgPricePerPy != null ? [current.avgPricePerPy] : []),
    ...nearby.map(n => n.avgPricePerPy),
  ]
  const maxPrice = Math.max(...allPrices)

  function Bar({ value, isCurrentComplex }: { value: number; isCurrentComplex: boolean }) {
    const pct = maxPrice > 0 ? Math.round((value / maxPrice) * 100) : 0
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <div style={{ flex: 1, height: 6, background: 'var(--bg-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 3,
            background: isCurrentComplex ? 'var(--dj-orange)' : 'var(--fg-tertiary)',
            opacity: isCurrentComplex ? 1 : 0.5,
          }} />
        </div>
        <span className="tnum" style={{
          font: `${isCurrentComplex ? 700 : 500} 13px/1 var(--font-sans)`,
          color: isCurrentComplex ? 'var(--dj-orange)' : 'var(--fg-pri)',
          width: 72,
          textAlign: 'right',
          flexShrink: 0,
        }}>
          {value.toLocaleString()}만/평
        </span>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ font: '700 15px/1.4 var(--font-sans)', margin: '0 0 16px' }}>
        주변 단지 시세 비교
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 현재 단지 */}
        {current.avgPricePerPy != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 100, flexShrink: 0 }}>
              <span style={{ font: '600 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)' }}>
                {current.name.length > 10 ? current.name.slice(0, 10) + '…' : current.name}
              </span>
              <span style={{
                display: 'block',
                font: '500 11px/1 var(--font-sans)',
                color: 'var(--dj-orange)',
                marginTop: 2,
              }}>
                이 단지
              </span>
            </div>
            <Bar value={current.avgPricePerPy} isCurrentComplex />
          </div>
        )}

        {/* 주변 단지 */}
        {nearby.map(n => (
          <div key={n.complexId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 100, flexShrink: 0 }}>
              <Link
                href={`/complexes/${n.complexId}`}
                style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--fg-pri)', textDecoration: 'none' }}
              >
                {n.complexName.length > 10 ? n.complexName.slice(0, 10) + '…' : n.complexName}
              </Link>
              <span style={{
                display: 'block',
                font: '500 11px/1 var(--font-sans)',
                color: 'var(--fg-tertiary)',
                marginTop: 2,
              }}>
                {fmtDist(n.distanceM)}
              </span>
            </div>
            <Bar value={n.avgPricePerPy} isCurrentComplex={false} />
          </div>
        ))}
      </div>

      <p style={{
        font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)',
        marginTop: 14, marginBottom: 0, textAlign: 'right',
      }}>
        최근 6개월 매매 실거래 평균 · 반경 2km
      </p>
    </div>
  )
}
