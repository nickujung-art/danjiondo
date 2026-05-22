'use client'
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs'
import Link from 'next/link'
import { useEffect } from 'react'

const STORAGE_KEY = 'dj_compare_ids'

/**
 * CompareFloatingBar — supplemental 표시기
 * D-09: URL 상태(nuqs)가 canonical source. 선택 추가/제거는 CompareAddButton이 담당.
 * localStorage로 페이지 이동 후에도 선택 상태 복원.
 * NOTE: CompareAddButton과 동일한 파서(parseAsArrayOf)를 사용해야 nuqs 충돌을 방지함.
 */
export function CompareFloatingBar() {
  const [ids, setIds] = useQueryState('ids', parseAsArrayOf(parseAsString).withDefault([]))

  useEffect(() => {
    try {
      if (ids.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
      else localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  }, [ids])

  // 페이지 이동 후 URL에 ids 없으면 localStorage에서 복원
  useEffect(() => {
    if (ids.length === 0) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const savedIds = JSON.parse(saved) as string[]
          if (savedIds.length > 0) void setIds(savedIds)
        }
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (ids.length < 2) return null

  return (
    <Link
      href={`/compare?ids=${ids.join(',')}`}
      className="btn btn-md btn-orange"
      style={{
        position:   'fixed',
        bottom:     24,
        right:      24,
        zIndex:     40,
        minHeight:  44,
        textDecoration: 'none',
      }}
      aria-label={`선택한 ${ids.length}개 단지 비교 보기`}
    >
      비교 보기 ({ids.length})
    </Link>
  )
}
