'use client'

import { useState } from 'react'

interface Props {
  url: string
  title: string
  text?: string
  /** 이 id 를 가진 DOM 요소를 이미지로 캡처해서 공유 */
  captureId?: string
}

export function ShareButton({ url, title, text, captureId }: Props) {
  const [busy, setBusy] = useState(false)

  async function handleShare() {
    if (typeof navigator === 'undefined') return

    if (captureId) {
      await handleImageShare()
      return
    }

    // 이미지 없이 URL 공유
    if ('share' in navigator) {
      try { await navigator.share({ title, text, url }) } catch { /* 취소됨 */ }
    } else {
      try { await (navigator as Navigator & { clipboard?: Clipboard }).clipboard?.writeText(url) } catch { /* clipboard 없음 */ }
    }
  }

  async function handleImageShare() {
    const el = document.getElementById(captureId!)
    if (!el) return

    setBusy(true)
    try {
      // html2canvas 동적 로드 (번들 분리)
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 2,               // 레티나 대응
        useCORS: true,
        logging: false,
        removeContainer: true,
      })

      await new Promise<void>((resolve) => {
        canvas.toBlob(async (blob) => {
          if (!blob) { resolve(); return }

          const file = new File([blob], 'danjiondo-ranking.png', { type: 'image/png' })
          const canShareWithFile =
            'share' in navigator &&
            'canShare' in navigator &&
            (navigator as Navigator & { canShare: (d: ShareData) => boolean }).canShare({ files: [file] })

          if (canShareWithFile) {
            // Web Share API Level 2 — 이미지 + URL 함께 공유
            try {
              await navigator.share({ files: [file], title, url })
            } catch { /* 취소됨 */ }
          } else if ('share' in navigator) {
            // 파일 미지원 → URL만 공유
            try { await navigator.share({ title, text, url }) } catch { /* 취소됨 */ }
          } else {
            // fallback: 이미지 다운로드 + 클립보드
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'danjiondo-ranking.png'
            a.click()
            setTimeout(() => URL.revokeObjectURL(a.href), 200)
            try { await (navigator as Navigator & { clipboard?: Clipboard }).clipboard?.writeText(url) } catch {}
          }
          resolve()
        }, 'image/png')
      })
    } catch {
      // 캡처 실패 시 URL 공유로 폴백
      if ('share' in navigator) {
        try { await navigator.share({ title, text, url }) } catch {}
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={() => void handleShare()}
      disabled={busy}
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          5,
        padding:      '7px 14px',
        borderRadius: 8,
        font:         '600 13px/1 var(--font-sans)',
        color:        busy ? '#999' : '#fff',
        background:   busy ? '#e5e7eb' : '#03c75a',
        border:       'none',
        cursor:       busy ? 'default' : 'pointer',
        whiteSpace:   'nowrap',
        flexShrink:   0,
        transition:   'background 0.15s',
      }}
      aria-label="공유하기"
    >
      {busy ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" strokeDasharray="56" strokeDashoffset="14" style={{ animation: 'spin 1s linear infinite', transformOrigin: 'center' }} />
          </svg>
          캡처 중
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          공유
        </>
      )}
    </button>
  )
}
