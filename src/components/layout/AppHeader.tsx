'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, User, Map, TrendingUp, Heart, FileText, Shield, Megaphone } from 'lucide-react'

const PC_NAV = [
  { href: '/',         label: '홈' },
  { href: '/rankings', label: '랭킹' },
  { href: '/presale',  label: '분양' },
] as const

type MoreItem = { href: string; label: string; Icon: React.ElementType } | null

const MORE_ITEMS: MoreItem[] = [
  { href: '/map',             label: '지도',             Icon: Map },
  { href: '/invest',          label: '투자 분석',         Icon: TrendingUp },
  { href: '/favorites',       label: '관심단지',           Icon: Heart },
  null,
  { href: '/legal/terms',     label: '이용약관',           Icon: FileText },
  { href: '/legal/privacy',   label: '개인정보처리방침',    Icon: Shield },
  { href: '/legal/ad-policy', label: '광고 정책',          Icon: Megaphone },
]

const MORE_PREFIXES = ['/map', '/invest', '/favorites', '/legal']

export function AppHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const moreActive = MORE_PREFIXES.some(p => pathname.startsWith(p))

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => { setOpen(false) }, [pathname])

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

        {/* 더보기 드롭다운 */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            aria-haspopup="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 56,
              padding: '0 14px',
              fontFamily: 'var(--font-sans)',
              fontWeight: open || moreActive ? 700 : 500,
              fontSize: 14,
              color: open || moreActive ? 'var(--fg-pri)' : 'var(--fg-sec)',
              background: 'none',
              border: 'none',
              borderBottom: open || moreActive ? '2px solid var(--dj-orange)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            더보기
          </button>

          {open && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                minWidth: 180,
                background: '#fff',
                border: '1px solid var(--line-default)',
                borderRadius: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                padding: '6px 4px',
                zIndex: 60,
              }}
            >
              {MORE_ITEMS.map((item, idx) =>
                item === null ? (
                  <div key={idx} style={{ height: 1, background: 'var(--line-subtle)', margin: '4px 8px' }} />
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 12px',
                      borderRadius: 8,
                      color: 'var(--fg-pri)',
                      textDecoration: 'none',
                      font: '500 14px/1 var(--font-sans)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <item.Icon size={17} strokeWidth={1.75} style={{ color: 'var(--fg-sec)', flexShrink: 0 }} />
                    {item.label}
                  </Link>
                )
              )}
            </div>
          )}
        </div>
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
