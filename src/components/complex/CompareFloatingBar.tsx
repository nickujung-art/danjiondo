'use client'
import { useQueryState } from 'nuqs'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'dj_compare_ids'

/**
 * CompareFloatingBar — supplemental 표시기
 * D-09 (LOCKED): URL 상태(nuqs)가 canonical source. 이 컴포넌트는 읽기 전용.
 * 선택 추가/제거는 CompareAddButton(nuqs 기반)이 담당.
 */
export function CompareFloatingBar() {
  const [idsParam] = useQueryState('ids')
  const [displayCount, setDisplayCount] = useState(0)
  const [storedIds, setStoredIds] = useState<string[]>([])

  useEffect(() => {
    const ids = idsParam ? idsParam.split(',').filter(Boolean) : []
    const count = ids.length
    setDisplayCount(count)
    setStoredIds(ids)
    try {
      if (count > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // localStorage unavailable
    }
  }, [idsParam])

  if (displayCount < 2) return null

  return (
    <Link
      href={`/compare?ids=${storedIds.join(',')}`}
      className="btn btn-md btn-orange"
      style={{
        position:   'fixed',
        bottom:     24,
        right:      24,
        zIndex:     40,
        minHeight:  44,
        textDecoration: 'none',
      }}
      aria-label={`선택한 ${displayCount}개 단지 비교 보기`}
    >
      비교 보기 ({displayCount})
    </Link>
  )
}
