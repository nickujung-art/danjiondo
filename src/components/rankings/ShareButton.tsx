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
      // 웹폰트(Pretendard) 완전 로드 대기 — 미로드 시 한글 글리프 깨짐
      await document.fonts.ready

      // html2canvas 동적 로드 (번들 분리)
      const { default: html2canvas } = await import('html2canvas')

      // body의 실제 계산 폰트 (CSS 변수 중첩 해소된 값)
      const resolvedFont = getComputedStyle(document.body).fontFamily

      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        removeContainer: true,
        scrollX: 0,
        scrollY: -window.scrollY,
        onclone: (_doc: Document, cloned: HTMLElement) => {
          // 1. base URL 설정 — @font-face의 상대경로가 올바르게 해석되도록
          const base = _doc.createElement('base')
          base.href = window.location.origin + '/'
          _doc.head.insertBefore(base, _doc.head.firstChild)

          // 2. @font-face 규칙 복사 — Pretendard를 cloned document에서도 로드
          try {
            const fontRules: string[] = []
            for (const sheet of Array.from(document.styleSheets)) {
              try {
                for (const rule of Array.from(sheet.cssRules)) {
                  if (rule.type === CSSRule.FONT_FACE_RULE) fontRules.push(rule.cssText)
                }
              } catch {} // cross-origin stylesheet
            }
            if (fontRules.length > 0) {
              const styleEl = _doc.createElement('style')
              styleEl.textContent = fontRules.join('\n')
              _doc.head.appendChild(styleEl)
            }
          } catch {}

          // 3. 인라인 스타일 일괄 수정
          cloned.querySelectorAll('*').forEach(node => {
            const el = node as HTMLElement
            if (!el.getAttribute) return
            const orig = el.getAttribute('style')
            if (!orig) return

            let s = orig
            // var(--font-sans) → 실제 폰트값 (font: 단축속성 내 var() html2canvas 파싱 불가)
            if (s.includes('var(--font-sans)')) {
              s = s.replace(/var\(--font-sans\)/g, resolvedFont)
            }
            // overflow:hidden + white-space:nowrap → overflow:visible
            // html2canvas baseline 오차로 overflow:hidden이 한글 받침의 하단을 잘라냄
            if (s.includes('white-space: nowrap') && s.includes('overflow: hidden')) {
              s = s.replace('overflow: hidden', 'overflow: visible')
            }
            // html2canvas 한글 받침 렌더링 수정:
            // inline-block: html2canvas가 라인박스 경계로 클리핑 → lh≥1.4 필요
            //   레이아웃 높이 유지를 위해 수직 padding을 (fs*0.2)px 줄여 보상
            //   (translateY는 레이아웃 height를 바꾸지 않아 아래 요소가 밀리므로 사용 안 함)
            // block/flex item: 클리핑 없음 → 작은 폰트만 12px로 키워 가독성 확보
            if (s.includes('display: inline-block')) {
              const fsMatch = s.match(/(\d+)px\/1(?!\.\d)/)
              if (fsMatch) {
                const fs = parseInt(fsMatch[1])
                if (fs <= 13) {
                  // lh=1 → 1.4 (받침 클리핑 방지, font-size 유지)
                  s = s.replace(/(\d+px\/)1(\s)/, '$11.4$2')
                  // 수직 padding 축소: lh 증가분(fs*0.2)만큼 상하 padding 감소 → 레이아웃 높이 유지
                  const reduce = Math.round(fs * 0.2) // 12px → 2, 11px → 2
                  s = s.replace(/padding:\s*([\d.]+)px(\s+)([\d.]+)px/, (_m, top, ws, lr) =>
                    `padding: ${Math.max(0, parseFloat(top) - reduce)}px${ws}${lr}px`
                  )
                  // 이전 방식의 translateY 잔재 제거
                  s = s.replace(/;\s*transform:\s*translateY\([^)]+\)/, '')
                }
              }
            } else if (s.match(/1[01]px\/1(?!\.\d)/)) {
              // 10-11px block/inline → 12px (클리핑 없음, 가독성 향상)
              s = s.replace(/1[01]px\/1(?!\.\d)(\s)/g, '12px/1$1')
            }
            if (s !== orig) el.setAttribute('style', s)
          })

          // 4. 루트 fontFamily 명시 (상속 체인 보장)
          cloned.style.fontFamily = resolvedFont

          // 5. 캡처 중 버튼 숨김
          cloned.querySelectorAll('[data-capture-hide]').forEach(node => {
            (node as HTMLElement).style.display = 'none'
          })

          // 6. 캡처 루트 clipping 방지
          cloned.style.overflow = 'visible'
          cloned.style.paddingBottom = '2px'
        },
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
      data-capture-hide="true"
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
