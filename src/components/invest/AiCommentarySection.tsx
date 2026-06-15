import { getRegionalCommentary } from '@/lib/ai/regional-commentary'
import type { CommentaryInput } from '@/lib/ai/regional-commentary'

interface Props {
  sggCode: string
  input:   CommentaryInput
}

// 비동기 서버 컴포넌트 — Suspense로 감싸면 페이지를 블로킹하지 않음
export async function AiCommentarySection({ sggCode, input }: Props) {
  const text = await getRegionalCommentary(sggCode, input).catch(() => null)
  if (!text) return null

  return (
    <div style={{
      marginBottom: 24,
      padding: '14px 18px',
      borderRadius: 12,
      background: 'var(--bg-surface)',
      border: '1px solid var(--line-default)',
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
    }}>
      <span style={{
        flexShrink: 0,
        width: 28, height: 28,
        borderRadius: 6,
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--line-subtle)',
        display: 'grid', placeItems: 'center',
        font: '600 11px/1 var(--font-sans)',
        color: 'var(--fg-sec)',
      }}>AI</span>
      <div>
        <p style={{ font: '500 13px/1.6 var(--font-sans)', color: 'var(--fg-pri)', margin: '0 0 6px' }}>
          {text}
        </p>
        <p style={{ font: '400 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: 0 }}>
          Gemini 2.5 Flash · 참고용, 투자 조언 아님
        </p>
      </div>
    </div>
  )
}
