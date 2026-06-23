'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'

export function AppHeader() {
  return (
    <header
      aria-label="상단 헤더"
      className="sticky top-0 z-50 h-14 flex items-center justify-between px-4 bg-white border-b border-[var(--line-default)]"
      data-capture-hide="true"
    >
      <Link href="/" className="dj-logo">
        <span className="mark">단</span>
        <span>단지온도</span>
      </Link>
      <button
        className="flex items-center justify-center w-11 h-11"
        aria-label="알림"
        style={{ color: 'var(--fg-pri)', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <Bell size={22} strokeWidth={1.75} />
      </button>
    </header>
  )
}
