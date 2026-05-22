'use client'

import Link from 'next/link'
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs'

interface CompareAddButtonProps {
  complexId:   string
  complexName: string
}

export function CompareAddButton({ complexId, complexName }: CompareAddButtonProps) {
  const [ids, setIds] = useQueryState(
    'ids',
    parseAsArrayOf(parseAsString).withDefault([]),
  )

  const isActive = ids.includes(complexId)
  const isFull   = ids.length >= 4 && !isActive

  function toggle() {
    if (isFull) return
    void setIds(prev =>
      isActive
        ? prev.filter(id => id !== complexId)
        : [...prev, complexId],
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={isFull}
        className={`btn btn-sm ${isActive ? 'btn-orange' : 'btn-secondary'}`}
        style={{
          opacity:    isFull ? 0.5 : 1,
          cursor:     isFull ? 'not-allowed' : 'pointer',
          transition: 'background 120ms ease, color 120ms ease',
        }}
        aria-label={
          isActive
            ? `${complexName} 비교에서 제거`
            : `${complexName} 비교에 추가`
        }
        aria-pressed={isActive}
      >
        {isFull ? '4/4 비교 중' : isActive ? '비교 중 ✓' : '비교에 추가 +'}
      </button>

      {/* 플로팅 비교 보기 버튼 — 2개 이상 선택 시 우하단에 표시 */}
      {ids.length >= 2 && (
        <Link
          href={`/compare?ids=${ids.join(',')}`}
          className="btn btn-md btn-orange"
          style={{
            position:  'fixed',
            bottom:    80,
            right:     24,
            zIndex:    50,
            minHeight: 44,
            textDecoration: 'none',
          }}
          aria-label={`선택한 ${ids.length}개 단지 비교 보기`}
        >
          비교 보기 ({ids.length})
        </Link>
      )}
    </>
  )
}
