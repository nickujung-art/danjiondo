'use client'

import { useState } from 'react'

// Kakao SDK 타입 선언 (별도 패키지 설치 불필요)
declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean
      init: (key: string) => void
      Share: {
        sendDefault: (options: KakaoShareOptions) => void
      }
    }
  }
}

interface KakaoShareOptions {
  objectType: 'feed'
  content: {
    title: string
    description: string
    imageUrl: string
    link: { mobileWebUrl: string; webUrl: string }
  }
  buttons: Array<{
    title: string
    link: { mobileWebUrl: string; webUrl: string }
  }>
}

interface Props {
  complexId: string
  complexName: string
  location?: string
  price?: number
  iconOnly?: boolean
}

interface KakaoShareParams {
  complexId: string
  complexName: string
  location?: string
  siteUrl: string
}

interface CopyLinkParams {
  complexId: string
  siteUrl: string
}

// Kakao SDK 동적 로드 (layout.tsx 수정 최소화)
function loadKakaoSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Not in browser'))
      return
    }
    if (document.getElementById('kakao-sdk-share')) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.id = 'kakao-sdk-share'
    script.src = '//t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js'
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Kakao SDK load failed'))
    document.head.appendChild(script)
  })
}

/**
 * 카카오톡 공유 핸들러 (named export — 테스트 가능)
 * window.Kakao가 없거나 SDK 로드 실패 시 handleCopyLink 폴백
 */
export function handleKakaoShare(params: KakaoShareParams): void {
  const { complexId, complexName, location, siteUrl } = params
  const complexUrl = `${siteUrl}/complexes/${complexId}`
  const ogImageUrl = `${siteUrl}/complexes/${complexId}/opengraph-image`
  const description = [location, '실거래가 확인'].filter(Boolean).join(' · ')

  // window.Kakao 없을 때 SDK 로드를 비동기로 시도 후 폴백
  void loadKakaoSdk()
    .then(() => {
      if (!window.Kakao) {
        // SDK 로드됐지만 window.Kakao 없으면 조용히 종료
        return
      }
      // 중복 초기화 방지 (RESEARCH.md Pitfall 4)
      if (!window.Kakao.isInitialized()) {
        window.Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? '')
      }
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: complexName,
          description,
          imageUrl: ogImageUrl,
          link: { mobileWebUrl: complexUrl, webUrl: complexUrl },
        },
        buttons: [
          {
            title: '실거래가 보기',
            link: { mobileWebUrl: complexUrl, webUrl: complexUrl },
          },
        ],
      })
    })
    .catch(() => {
      // SDK 로드 실패 시 링크 복사로 폴백
      void handleCopyLink({ complexId, siteUrl })
    })
}

/**
 * 링크 복사 핸들러 (named export — 테스트 가능)
 */
export async function handleCopyLink(params: CopyLinkParams): Promise<void> {
  const { complexId, siteUrl } = params
  const complexUrl = `${siteUrl}/complexes/${complexId}`
  await navigator.clipboard.writeText(complexUrl)
}

function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function formatPriceBrief(price: number): string {
  const uk = Math.floor(price / 10000)
  return uk > 0 ? `${uk}억` : `${price.toLocaleString()}만`
}

export function ShareButton({ complexId, complexName, location, price, iconOnly = false }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://danjiondo.kr'
  const complexUrl = `${siteUrl}/complexes/${complexId}`

  const description = [
    location,
    price != null ? `최고 ${formatPriceBrief(price)}` : null,
    '실거래가 확인',
  ]
    .filter(Boolean)
    .join(' · ')

  const onKakaoShare = () => {
    handleKakaoShare({ complexId, complexName, location, siteUrl })
    setOpen(false)
  }

  const onNaverShare = () => {
    const encoded = encodeURIComponent(complexUrl)
    const title = encodeURIComponent(complexName)
    window.open(
      `https://share.naver.com/web/shareView?url=${encoded}&title=${title}`,
      '_blank',
      'noopener,noreferrer',
    )
    setOpen(false)
  }

  const onCopyLink = async () => {
    await handleCopyLink({ complexId, siteUrl })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    setOpen(false)
  }

  // description은 Kakao 공유 시 활용 (현재 handleKakaoShare에 포함)
  void description

  const triggerButton = iconOnly ? (
    <button
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        border: '1px solid var(--line-default)',
        background: 'var(--bg-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'var(--fg-sec)',
        flexShrink: 0,
      }}
      aria-label="공유"
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
    >
      <ShareIcon />
    </button>
  ) : (
    <button
      className="btn btn-md btn-ghost"
      style={{ color: 'var(--fg-sec)', gap: 6 }}
      aria-label="공유"
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
    >
      <ShareIcon />
      공유
    </button>
  )

  return (
    <div style={{ position: 'relative' }}>
      {triggerButton}

      {open && (
        <>
          {/* 드롭다운 오버레이 (클릭 시 닫기) */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
            }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* 공유 메뉴 */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 6,
              background: '#fff',
              border: '1px solid var(--line-default)',
              borderRadius: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              zIndex: 50,
              minWidth: 160,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={onKakaoShare}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '12px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                font: '500 14px/1 var(--font-sans)',
                color: '#111',
                textAlign: 'left',
              }}
            >
              {/* 카카오 노란 원 아이콘 대용 */}
              <span
                style={{
                  width: 22,
                  height: 22,
                  background: '#FEE500',
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                K
              </span>
              카카오톡 공유
            </button>

            <div style={{ height: 1, background: 'var(--line-subtle)', margin: '0 12px' }} />

            <button
              onClick={onNaverShare}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '12px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                font: '500 14px/1 var(--font-sans)',
                color: '#111',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  background: '#03C75A',
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                N
              </span>
              네이버 공유
            </button>

            <div style={{ height: 1, background: 'var(--line-subtle)', margin: '0 12px' }} />

            <button
              onClick={() => void onCopyLink()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '12px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                font: '500 14px/1 var(--font-sans)',
                color: '#111',
                textAlign: 'left',
              }}
            >
              <span style={{ flexShrink: 0 }}>
                <CopyIcon />
              </span>
              {copied ? '복사됨!' : '링크 복사'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
