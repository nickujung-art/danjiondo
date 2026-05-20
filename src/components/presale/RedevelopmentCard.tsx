import type { RedevelopmentComplex } from '@/lib/data/presale'
import Link from 'next/link'

interface Props {
  complex: RedevelopmentComplex
}

export function RedevelopmentCard({ complex }: Props) {
  const locationChip = [complex.si, complex.gu].filter(Boolean).join(' ')

  const inner = (
    <article
      aria-label={`${complex.canonical_name} 재건축 예정 단지`}
      className="card-flat"
      style={{
        padding: 20,
        cursor: 'pointer',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
      }}
    >
      {/* 상단 메타 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        {locationChip ? (
          <span className="chip sm outlined">{locationChip}</span>
        ) : (
          <span />
        )}
        <span className="badge neutral" style={{ font: '500 11px/1 var(--font-sans)' }}>
          재건축 예정
        </span>
      </div>

      {/* 단지명 */}
      <div
        style={{
          font: '700 16px/1.3 var(--font-sans)',
          color: 'var(--fg-pri)',
          marginBottom: 6,
        }}
      >
        {complex.canonical_name}
      </div>

      {/* predecessor 표기 */}
      {complex.predecessor_name && (
        <div
          style={{
            font: '500 12px/1.4 var(--font-sans)',
            color: 'var(--fg-sec)',
            marginBottom: 4,
          }}
        >
          기존: {complex.predecessor_name}
        </div>
      )}

      {/* 세대수 */}
      {complex.household_count != null && (
        <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
          총 {complex.household_count}세대
        </div>
      )}
    </article>
  )

  return (
    <Link href={`/complexes/${complex.id}`} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  )
}
