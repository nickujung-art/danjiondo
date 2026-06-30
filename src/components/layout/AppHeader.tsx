'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, User } from 'lucide-react'

const PC_NAV = [
  { href: '/',         label: '홈' },
  { href: '/rankings', label: '랭킹' },
  { href: '/presale',  label: '분양' },
  { href: '/map',      label: '지도' },
  { href: '/invest',   label: '투자' },
] as const

export function AppHeader() {
  const pathname = usePathname()

  return (
    <header
      aria-label="상단 헤더"
      className="sticky top-0 z-50 h-14 flex items-center bg-white border-b border-[var(--line-default)]"
      data-capture-hide="true"
    >
      <div className="px-4 flex-shrink-0">
        <Link href="/" className="dj-logo">
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
      </div>

      {/* PC 전용 네비게이션 */}
      <nav className="hidden sm:flex items-center flex-1" aria-label="주 네비게이션">
        {PC_NAV.map(({ href, label }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 56,
                padding: '0 14px',
                fontFamily: 'var(--font-sans)',
                fontWeight: active ? 700 : 500,
                fontSize: 14,
                color: active ? 'var(--fg-pri)' : 'var(--fg-sec)',
                textDecoration: 'none',
                borderBottom: active ? '2px solid var(--dj-orange)' : '2px solid transparent',
                transition: 'color 0.15s',
              }}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      {/* 우측 아이콘 (모바일·PC 공통) */}
      <div className="flex items-center ml-auto sm:ml-0 pr-1">
        <button
          className="flex items-center justify-center w-11 h-11"
          aria-label="알림"
          style={{ color: 'var(--fg-pri)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Bell size={22} strokeWidth={1.75} />
        </button>
        <Link
          href="/profile"
          className="flex items-center justify-center w-11 h-11"
          aria-label="MY"
          style={{ color: 'var(--fg-pri)' }}
        >
          <User size={22} strokeWidth={1.75} />
        </Link>
      </div>
    </header>
  )
}
