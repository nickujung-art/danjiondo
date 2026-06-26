'use client'
import { useState, useRef, useEffect } from 'react'

// D-10 LOCKED: 4장 카드셋 (cover/highlight/ranking/closing)
interface HtmlCards {
  cover: string
  highlight: string
  ranking: string
  closing: string
}

interface Props {
  htmlCards: HtmlCards | null
  loading: boolean
}

const TABS = [
  { key: 'cover' as const, label: '커버' },
  { key: 'highlight' as const, label: '하이라이트' },
  { key: 'ranking' as const, label: '랭킹' },
  { key: 'closing' as const, label: '클로징' },
]

// PITFALL-2: iframe 1080×1080, scale은 ResizeObserver로 컨테이너 너비 기반 동적 계산
function CardPreview({ html, label }: { html: string; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 432
      setScale(w / 1080)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500 text-center">{label}</p>
      <div
        ref={containerRef}
        style={{ width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', position: 'relative' }}
        className="border border-gray-200 rounded"
      >
        <iframe
          srcDoc={html}
          style={{
            width: 1080,
            height: 1080,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 'none',
          }}
          title={`카드뉴스 미리보기 — ${label}`}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  )
}

export function BuilderPreviewPanel({ htmlCards, loading }: Props) {
  const [activeTab, setActiveTab] = useState<keyof HtmlCards>('cover')

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-sm text-gray-500 text-center">HTML 생성 중...</p>
      </div>
    )
  }

  if (!htmlCards) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-sm text-gray-400 text-center">
          데이터 조회 후 미리보기가 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">카드 미리보기</h2>

      {/* 모바일: 탭 + 단일 카드 */}
      <div className="block sm:hidden">
        <div className="flex border-b border-gray-200 mb-4">
          {TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <CardPreview
          html={htmlCards[activeTab]}
          label={TABS.find(t => t.key === activeTab)?.label ?? ''}
        />
      </div>

      {/* 데스크탑: 2×2 그리드 — 각 카드가 컨테이너 너비에 맞게 자동 스케일 */}
      <div className="hidden sm:grid sm:grid-cols-2 gap-4">
        {TABS.map(tab => (
          <CardPreview key={tab.key} html={htmlCards[tab.key]} label={tab.label} />
        ))}
      </div>
    </div>
  )
}
