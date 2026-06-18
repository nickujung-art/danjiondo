'use client'

interface Props {
  url: string
  title: string
  text?: string
}

export function ShareButton({ url, title, text }: Props) {
  async function handleShare() {
    if (typeof navigator === 'undefined') return
    if ('share' in navigator) {
      try {
        await navigator.share({ title, text, url })
      } catch { /* 취소됨 */ }
    } else {
      try {
        await (navigator as Navigator & { clipboard?: Clipboard }).clipboard?.writeText(url)
      } catch { /* clipboard 없음 */ }
    }
  }

  return (
    <button
      onClick={() => void handleShare()}
      style={{
        display:    'inline-flex',
        alignItems: 'center',
        gap:        5,
        padding:    '7px 14px',
        borderRadius: 8,
        font:       '600 13px/1 var(--font-sans)',
        color:      '#fff',
        background: '#03c75a',
        border:     'none',
        cursor:     'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      aria-label="공유하기"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
      공유
    </button>
  )
}
