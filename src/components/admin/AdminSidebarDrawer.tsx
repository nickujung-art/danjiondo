'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AdminSidebarLinks } from './AdminSidebarLinks'
import { buildNavItems } from './AdminSidebar'

interface PendingCounts {
  reports: number
  ads: number
  gps: number
}

interface AdminSidebarDrawerProps {
  pendingCounts: PendingCounts
}

export function AdminSidebarDrawer({ pendingCounts }: AdminSidebarDrawerProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const items = buildNavItems(pendingCounts)

  // 경로 변경 시 drawer 닫기
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      {/* 모바일 상단바 — CSS @media로 제어 */}
      <div className="admin-mobile-header">
        <button
          type="button"
          aria-label="메뉴 열기"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          style={{
            padding: 8,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--fg-pri)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M2 5h16M2 10h16M2 15h16"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <span style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>
          단지온도 어드민
        </span>
      </div>

      {/* Overlay backdrop */}
      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 200,
          }}
        />
      )}

      {/* Slide-in drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="어드민 메뉴"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 240,
          background: '#fff',
          borderRight: '1px solid var(--line-default)',
          zIndex: 201,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 200ms ease',
          overflowY: 'auto',
          padding: '16px 8px',
        }}
      >
        <AdminSidebarLinks items={items} onItemClick={() => setOpen(false)} />
      </div>
    </>
  )
}
