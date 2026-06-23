'use client'

import { Drawer } from 'vaul'
import { X } from 'lucide-react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/45 z-[200]" />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-[201] rounded-t-[20px] bg-white max-h-[90dvh] overflow-y-auto"
          style={{
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
          }}
          aria-label={title}
        >
          <div className="flex justify-center pt-3">
            <div className="w-10 h-1 rounded-full bg-[var(--line-default)]" />
          </div>
          <div className="flex items-center justify-between px-5 pt-3 pb-4 border-b border-[var(--line-subtle)]">
            <h2 className="text-xl font-bold">{title}</h2>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="flex items-center justify-center w-11 h-11 rounded-full"
              style={{ background: 'var(--bg-surface-2)', border: 'none', cursor: 'pointer', color: 'var(--fg-sec)' }}
            >
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>
          <div>{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
