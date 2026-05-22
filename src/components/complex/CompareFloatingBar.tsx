'use client'
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs'
import Link from 'next/link'

/**
 * CompareFloatingBar — supplemental 표시기
 * D-09 (LOCKED): URL 상태(nuqs)가 canonical source. 이 컴포넌트는 읽기 전용.
 * 선택 추가/제거는 CompareAddButton(nuqs 기반)이 담당.
 * NOTE: CompareAddButton과 동일한 파서(parseAsArrayOf)를 사용해야 nuqs 충돌을 방지함.
 */
export function CompareFloatingBar() {
  const [ids] = useQueryState('ids', parseAsArrayOf(parseAsString).withDefault([]))

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
