import type { NewBuiltComplex } from '@/lib/data/presale'
import Link from 'next/link'

interface Props {
  complex: NewBuiltComplex
}

export function NewBuildCard({ complex }: Props) {
  const locationChip = [complex.si, complex.gu].filter(Boolean).join(' ')

  return (
    <Link href={`/complexes/${complex.id}`} style={{ textDecoration: 'none' }}>
      <article
        aria-label={`${complex.canonical_name} 신축 단지`}
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
            신축
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

        {/* 준공연도 (핵심 수치) */}
        <div
          className="tnum"
          style={{
            font: '700 22px/1.2 var(--font-sans)',
            color: 'var(--dj-orange)',
            marginBottom: 8,
          }}
        >
          {complex.built_year}년 준공
        </div>

        {/* 세대수 */}
        {complex.household_count != null && (
          <div style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
            총 {complex.household_count}세대
          </div>
        )}
      </article>
    </Link>
  )
}
