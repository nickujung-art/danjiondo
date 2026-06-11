import React from 'react'
import Link from 'next/link'
import type { ComplexSearchResult } from '@/lib/data/complex-search'
import { AdBanner } from '@/components/ads/AdBanner'
import type { AdCampaign } from '@/lib/data/ads'
import { complexHref } from '@/lib/format'

interface Props {
  complexes:  ComplexSearchResult[]
  query:      string
  inFeedAds?: AdCampaign[]
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark
        style={{
          background: 'var(--dj-orange-tint)',
          color: 'var(--dj-orange)',
          padding: 0,
        }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export function ComplexList({ complexes, query, inFeedAds = [] }: Props) {
  if (!query.trim()) {
    return (
      <div
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          font: '500 13px/1.6 var(--font-sans)',
          color: 'var(--fg-tertiary)',
        }}
      >
        단지명을 입력하면
        <br />
        검색 결과가 표시됩니다
      </div>
    )
  }

  if (complexes.length === 0) {
    return (
      <div
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          font: '500 13px/1.6 var(--font-sans)',
          color: 'var(--fg-tertiary)',
        }}
      >
        &ldquo;{query}&rdquo; 검색 결과가 없습니다
      </div>
    )
  }

  const firstAd = inFeedAds[0] ?? null

  return (
    <div>
      <div
        style={{
          padding: '12px 16px 8px',
          font: '500 11px/1 var(--font-sans)',
          color: 'var(--fg-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        단지 ({complexes.length})
      </div>
      {complexes.map((c, index) => {
        const addressParts = [c.si, c.gu, c.dong].filter(Boolean)
        const address = c.road_address ?? addressParts.join(' ') ?? ''
        return (
          <React.Fragment key={c.id}>
            <Link
              href={complexHref(c.id, c.url_slug && c.status === 'active' ? c.url_slug : null)}
              className="complex-list-item"
              style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--line-subtle)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'var(--bg-surface-2)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    color: 'var(--fg-sec)',
                  }}
                >
                  <PinIcon />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      font: '600 14px/1.4 var(--font-sans)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {highlightText(c.canonical_name, query)}
                  </div>
                  {address && (
                    <div
                      style={{
                        font: '500 12px/1.4 var(--font-sans)',
                        color: 'var(--fg-sec)',
                        marginTop: 2,
                      }}
                    >
                      {address}
                    </div>
                  )}
                </div>
              </div>
            </Link>
            {index === Math.min(4, complexes.length - 1) && firstAd && (
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line-subtle)' }}>
                <AdBanner ad={firstAd} />
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
