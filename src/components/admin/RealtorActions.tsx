'use client'

import { useTransition } from 'react'
import { deleteRealtor } from '@/lib/auth/realtor-actions'

interface Props {
  id: string
  isActive: boolean
}

export function RealtorActions({ id }: Props) {
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm('이 공인중개사를 삭제하면 단지 배정도 모두 삭제됩니다. 삭제하시겠습니까?')) return
    startTransition(async () => {
      const result = await deleteRealtor(id)
      if (result.error) alert(result.error)
    })
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        className="btn btn-sm btn-ghost"
        style={{ fontSize: 11, color: '#dc2626' }}
        disabled={pending}
        onClick={handleDelete}
      >
        삭제
      </button>
    </div>
  )
}
