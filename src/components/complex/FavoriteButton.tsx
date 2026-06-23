'use client'

import { useState, useTransition } from 'react'
import { addFavorite, removeFavorite } from '@/lib/auth/favorite-actions'

interface Props {
  complexId:        string
  initialFavorited?: boolean
  iconOnly?:        boolean
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M6 4h12v17l-6-4-6 4z" />
    </svg>
  )
}

export function FavoriteButton({ complexId, initialFavorited = false, iconOnly = false }: Props) {
  const [favorited, setFavorited] = useState(initialFavorited)
  const [isPending, startTransition] = useTransition()

  const toggle = () => {
    startTransition(async () => {
      if (favorited) {
        const { error } = await removeFavorite(complexId)
        if (!error) setFavorited(false)
      } else {
        const { error } = await addFavorite(complexId)
        if (error === '로그인이 필요합니다') {
          window.location.href = `/login?next=/complexes/${complexId}`
          return
        }
        if (!error) setFavorited(true)
      }
    })
  }

  if (iconOnly) {
    return (
      <button
        onClick={toggle}
        disabled={isPending}
        aria-label={favorited ? '관심단지 해제' : '관심단지 추가'}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          border: `1px solid ${favorited ? 'var(--dj-orange)' : 'var(--line-default)'}`,
          background: favorited ? 'rgba(255,120,50,0.08)' : 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: favorited ? 'var(--dj-orange)' : 'var(--fg-sec)',
          opacity: isPending ? 0.7 : 1,
          flexShrink: 0,
        }}
      >
        <BookmarkIcon filled={favorited} />
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={`btn btn-md ${favorited ? 'btn-orange' : 'btn-secondary'}`}
      style={{ gap: 6, opacity: isPending ? 0.7 : 1 }}
    >
      <BookmarkIcon filled={favorited} />
      {favorited ? '관심단지 ✓' : '관심단지'}
    </button>
  )
}
