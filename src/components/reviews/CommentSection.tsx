'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { submitComment, reportComment } from '@/lib/auth/comment-actions'
import type { CommentWithUserInfo } from '@/lib/data/comments'
import { getTierBadgeText } from '@/lib/data/member-tier'
import type { MemberTier } from '@/lib/data/member-tier'

interface Props {
  reviewId: string
  complexId: string
  initialComments: CommentWithUserInfo[]
  currentUserId?: string | null
}

function formatNick(userId: string | null): string {
  if (!userId) return '익명'
  return userId.slice(0, 5) + '***'
}

export function CommentSection({ reviewId, complexId, initialComments, currentUserId }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())

  function handleReport(commentId: string) {
    startTransition(async () => {
      const result = await reportComment(commentId)
      if (!result.error) setReportedIds(prev => new Set(prev).add(commentId))
    })
  }

  const visible = showAll ? initialComments : initialComments.slice(0, 3)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await submitComment({ reviewId, complexId, content })
      if (result.error) {
        setError(result.error)
      } else {
        setContent('')
      }
    })
  }

  return (
    <div style={{ borderTop: '1px solid var(--line-subtle)', paddingTop: 10, marginTop: 10 }}>
      {/* 댓글 목록 */}
      {initialComments.length === 0 ? (
        <p style={{ font: '500 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', margin: '0 0 10px' }}>
          댓글이 없습니다. 첫 번째 의견을 남겨보세요.
        </p>
      ) : (
        <div
          id={`comment-list-${reviewId}`}
          role="list"
        >
          {visible.map((c, i) => (
            <div
              key={c.id}
              role="article"
              aria-label="댓글"
              style={{
                padding: '10px 0',
                borderBottom: i < visible.length - 1 ? '1px solid var(--line-subtle)' : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span
                  style={{
                    font: '500 11px/1 var(--font-sans)',
                    color: 'var(--fg-tertiary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  {formatNick(c.user_id)}
                  {/* TierBadge: 등급 배지 (텍스트 약자 렌더, D-06 AI 슬롭 금지) */}
                  {(c.member_tier as MemberTier | null | undefined) && (c.member_tier as MemberTier) !== 'bronze' && (
                    <span
                      style={{
                        font: '600 10px/1 var(--font-sans)',
                        letterSpacing: '0.02em',
                        marginLeft: 2,
                      }}
                      aria-label="등급 배지"
                    >
                      {getTierBadgeText((c.member_tier as MemberTier | null | undefined) ?? 'bronze')}
                    </span>
                  )}
                  {' · '}
                  {new Date(c.created_at).toLocaleDateString('ko-KR')}
                </span>
                {currentUserId && currentUserId !== c.user_id && (
                  <button
                    type="button"
                    aria-label="댓글 신고"
                    disabled={reportedIds.has(c.id)}
                    onClick={() => handleReport(c.id)}
                    style={{
                      font: '500 10px/1 var(--font-sans)',
                      color: reportedIds.has(c.id) ? 'var(--fg-tertiary)' : 'var(--fg-sec)',
                      background: 'none',
                      border: 'none',
                      cursor: reportedIds.has(c.id) ? 'default' : 'pointer',
                      padding: 0,
                    }}
                  >
                    {reportedIds.has(c.id) ? '신고됨' : '신고'}
                  </button>
                )}
              </div>
              <p style={{ font: '500 13px/1.55 var(--font-sans)', color: 'var(--fg-pri)', margin: 0 }}>
                {c.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 더 보기 토글 */}
      {initialComments.length > 3 && (
        <button
          type="button"
          aria-expanded={showAll}
          aria-controls={`comment-list-${reviewId}`}
          onClick={() => setShowAll(v => !v)}
          style={{
            font: '500 11px/1 var(--font-sans)',
            color: showAll ? 'var(--fg-sec)' : 'var(--dj-orange)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 0',
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {showAll
            ? '댓글 접기 ↑'
            : `댓글 ${initialComments.length - 3}개 더 보기 ↓`}
        </button>
      )}

      {/* 댓글 작성 폼 (로그인 사용자만) */}
      {currentUserId ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="댓글을 입력해주세요. (10자 이상)"
            maxLength={500}
            rows={2}
            className="input"
            aria-label="댓글 작성"
            aria-required="true"
            style={{ font: '500 13px/1.55 var(--font-sans)', padding: '8px 10px', resize: 'none' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                font: '500 11px/1 var(--font-sans)',
                color: content.length < 10 ? '#dc2626' : 'var(--fg-tertiary)',
              }}
            >
              {content.length}/500
            </span>
            {error && (
              <span style={{ font: '500 11px/1 var(--font-sans)', color: '#dc2626', flex: 1 }}>{error}</span>
            )}
            <button
              type="submit"
              className="btn btn-sm btn-orange"
              disabled={pending || content.length < 10}
            >
              {pending ? '등록 중…' : '댓글 등록'}
            </button>
          </div>
        </form>
      ) : (
        <p style={{ font: '500 11px/1.4 var(--font-sans)', color: 'var(--fg-tertiary)', marginTop: 12 }}>
          <Link href="/login" style={{ color: 'var(--dj-orange)', textDecoration: 'none' }}>로그인</Link>
          하면 댓글을 달 수 있어요.
        </p>
      )}
    </div>
  )
}
