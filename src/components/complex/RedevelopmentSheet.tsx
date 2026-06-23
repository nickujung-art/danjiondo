'use client'

import { useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { RedevelopmentTimeline } from './RedevelopmentTimeline'

interface RedevelopmentSheetProps {
  phase: string
  notes: string | null
}

export function RedevelopmentSheet({ phase, notes }: RedevelopmentSheetProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full min-h-[44px] flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--line-default)] text-left"
        aria-label="재건축 타임라인 보기"
        style={{ background: 'var(--bg-surface)', cursor: 'pointer' }}
      >
        <span style={{ font: '600 15px/1.3 var(--font-sans)', color: 'var(--fg-pri)' }}>
          재건축 진행 현황
        </span>
        <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
          자세히 보기 ›
        </span>
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="재건축 진행 단계"
      >
        <div className="px-5 pb-6">
          <RedevelopmentTimeline phase={phase} notes={notes} />
        </div>
      </BottomSheet>
    </>
  )
}
