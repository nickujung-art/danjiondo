'use client'
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs'
import Link from 'next/link'
import { useEffect, useRef } from 'react'

const STORAGE_KEY = 'dj_compare_ids'

/**
 * CompareFloatingBar — supplemental 표시기
 * D-09: URL 상태(nuqs)가 canonical source. 선택 추가/제거는 CompareAddButton이 담당.
 * localStorage로 페이지 이동 후에도 선택 상태 복원.
 * NOTE: 단일 effect + initialized ref로 "초기 마운트 시 ids=[]가 localStorage를 지우는" 경쟁 조건 방지.
 */
export function CompareFloatingBar() {
  const [ids, setIds] = useQueryState('ids', parseAsArrayOf(parseAsString).withDefault([]))
  const initialized = useRef(false)

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      // 첫 마운트: URL에 ids 없으면 localStorage에서 복원
      if (ids.length === 0) {
        try {
          const saved = localStorage.getItem(STORAGE_KEY)
          if (saved) {
            const savedIds = JSON.parse(saved) as string[]
            if (savedIds.length > 0) void setIds(savedIds)
          }
        } catch { /* ignore */ }
      }
      return
    }
    // 이후 변경: localStorage 동기화
    try {
      if (ids.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
      else localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  if (ids.length < 2) return null

  return (
    <Link
      href={`/compare?ids=${ids.join(',')}`}
      className="btn btn-md btn-orange"
      style={{
        position:   'fixed',
        bottom:     'calc(64px + env(safe-area-inset-bottom, 0px) + 16px)',
        right:      24,
        zIndex:     50,
        minHeight:  44,
        textDecoration: 'none',
      }}
      aria-label={`선택한 ${ids.length}개 단지 비교 보기`}
    >
      비교 보기 ({ids.length})
    </Link>
  )
}
