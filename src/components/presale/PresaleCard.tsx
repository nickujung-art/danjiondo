import type { CheongyakListing } from '@/lib/data/presale'
import Link from 'next/link'

interface Props {
  listing: CheongyakListing
  expired?: boolean
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '청약일정 미정'
  const fmt = (iso: string) => {
    const parts = iso.split('-')
    const m = parts[1] ?? ''
    const d = parts[2] ?? ''
    return `${m}.${d}`
  }
  if (start && end) return `${fmt(start)}~${fmt(end)}`
  if (start) return `${fmt(start)}~`
  return `~${fmt(end!)}`
}

function formatMoveInYM(ym: string | null): string {
  if (!ym || ym.length !== 6) return '입주예정 미정'
  const year = ym.slice(0, 4)
  const month = ym.slice(4, 6)
  return `${year}년 ${month}월 입주예정`
}

function formatCompetitionRate(rate: number | null): string | null {
  if (rate == null) return null
  return `${rate.toFixed(1)}:1`
}

export function PresaleCard({ listing, expired = false }: Props) {
  const inner = (
    <article
      aria-label={`${listing.pblanc_nm ?? '분양 공고'} 청약 정보`}
      className="card-flat"
      style={{
        padding: 20,
        cursor: listing.complex_id ? 'pointer' : 'default',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
        opacity: expired ? 0.65 : 1,
      }}
    >
      {/* 상단 메타 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="chip sm outlined">{listing.region}</span>
          {expired && (
            <span className="badge neg" style={{ font: '500 11px/1 var(--font-sans)' }}>
              마감
            </span>
          )}
        </div>
        <span className="badge neutral" style={{ font: '500 11px/1 var(--font-sans)' }}>
          {formatDateRange(listing.rcept_bgnde, listing.rcept_endde)}
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
        {listing.pblanc_nm ?? '주택명 미정'}
      </div>

      {/* 세대수 (핵심 수치) */}
      <div
        className="tnum"
        style={{
          font: '700 22px/1.2 var(--font-sans)',
          color: 'var(--dj-orange)',
          marginBottom: 8,
        }}
      >
        {listing.supply_count != null ? `${listing.supply_count}세대` : '세대수 미정'}
      </div>

      {/* 경쟁률 (있을 때만) */}
      {formatCompetitionRate(listing.competition_rate) != null && (
        <div style={{ marginBottom: 6 }}>
          <span
            className="badge pos"
            style={{ font: '500 11px/1 var(--font-sans)' }}
          >
            경쟁률 {formatCompetitionRate(listing.competition_rate)}
          </span>
        </div>
      )}

      {/* 입주예정 */}
      <div style={{ font: '500 12px/1.4 var(--font-sans)', color: 'var(--fg-sec)', marginBottom: 4 }}>
        {formatMoveInYM(listing.mvn_prearnge_ym)}
      </div>

      {/* 공급위치 */}
      {listing.hssply_adres && (
        <div style={{ font: '500 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)' }}>
          {listing.hssply_adres}
        </div>
      )}
    </article>
  )

  return listing.complex_id ? (
    <Link href={`/complexes/${listing.complex_id}`} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  ) : (
    inner
  )
}
