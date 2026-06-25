'use client'

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

const CARD_LABELS = ['커버', '하이라이트', '랭킹', '클로징'] as const

// PITFALL-2: iframe은 1080×1080, container는 432px(=1080*0.4) overflow-hidden, scale(0.4) 적용
// CLAUDE.md: 애니메이션은 transform·opacity·clip-path만 허용 (width/height 금지)
function CardPreview({ html, label }: { html: string; label: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500 text-center">{label}</p>
      <div
        style={{ width: 432, height: 432, overflow: 'hidden', position: 'relative' }}
        className="border border-gray-200 rounded"
      >
        <iframe
          srcDoc={html}
          style={{
            width: 1080,
            height: 1080,
            transform: 'scale(0.4)',
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

  const cards = [htmlCards.cover, htmlCards.highlight, htmlCards.ranking, htmlCards.closing]

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">카드 미리보기</h2>
      <div className="grid grid-cols-2 gap-4">
        {cards.map((html, i) => (
          <CardPreview key={i} html={html ?? ''} label={CARD_LABELS[i] ?? ''} />
        ))}
      </div>
    </div>
  )
}
