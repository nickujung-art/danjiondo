// RSC — NO 'use client' (D-05)
import type { Realtor } from '@/lib/data/realtors'

interface RealtorCardProps {
  realtor: Realtor
}

export function RealtorCard({ realtor }: RealtorCardProps) {
  const initials = realtor.name.slice(0, 2)

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            flexShrink: 0,
            overflow: 'hidden',
            background: 'var(--bg-surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {realtor.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={realtor.image_url}
              alt={realtor.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span
              style={{
                font: '600 14px/1 var(--font-sans)',
                color: 'var(--fg-sec)',
              }}
            >
              {initials}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              font: '700 14px/1.3 var(--font-sans)',
              color: 'var(--fg-pri)',
              marginBottom: 2,
            }}
          >
            {realtor.name}
          </div>
          <div
            style={{
              font: '500 12px/1.3 var(--font-sans)',
              color: 'var(--fg-sec)',
              marginBottom: 6,
            }}
          >
            {realtor.agency_name}
          </div>
          {realtor.description && (
            <div
              style={{
                font: '400 12px/1.5 var(--font-sans)',
                color: 'var(--fg-tertiary)',
                marginBottom: 8,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {realtor.description}
            </div>
          )}
          {/* tel: 링크 (D-07) — 하이픈 제거 (Pitfall 5) */}
          <a
            href={`tel:${realtor.phone.replace(/[^0-9+]/g, '')}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 12px',
              borderRadius: 6,
              background: 'var(--dj-orange)',
              color: '#fff',
              font: '600 12px/1 var(--font-sans)',
              textDecoration: 'none',
            }}
          >
            전화 문의 &nbsp;{realtor.phone}
          </a>
        </div>
      </div>
    </div>
  )
}
