'use client'

import { useTransition } from 'react'
import { approveAdCampaign, rejectAdCampaign, pauseAdCampaign, deleteAdCampaign } from '@/lib/auth/ad-actions'

interface Props {
  id: string
  status: string
}

export function AdminCampaignActions({ id, status }: Props) {
  const [pending, startTransition] = useTransition()

  function call(action: (id: string) => Promise<{ error: string | null }>) {
    startTransition(async () => {
      const result = await action(id)
      if (result.error) alert(result.error)
    })
  }

  function handleDelete() {
    if (!confirm('이 광고를 삭제하면 복구할 수 없습니다. 삭제하시겠습니까?')) return
    call(deleteAdCampaign)
  }

  const deleteBtn = (
    <button
      className="btn btn-sm btn-ghost"
      style={{ fontSize: 11, color: '#dc2626' }}
      disabled={pending}
      onClick={handleDelete}
    >
      삭제
    </button>
  )

  if (status === 'pending') {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} disabled={pending} onClick={() => call(approveAdCampaign)}>
          승인
        </button>
        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} disabled={pending} onClick={() => call(rejectAdCampaign)}>
          거절
        </button>
        {deleteBtn}
      </div>
    )
  }
  if (status === 'approved') {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }} disabled={pending} onClick={() => call(pauseAdCampaign)}>
          일시중지
        </button>
        {deleteBtn}
      </div>
    )
  }
  if (status === 'paused') {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, color: '#16a34a' }} disabled={pending} onClick={() => call(approveAdCampaign)}>
          재개
        </button>
        {deleteBtn}
      </div>
    )
  }
  return deleteBtn
}
