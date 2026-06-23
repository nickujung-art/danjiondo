'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BarChart2, Building2, User } from 'lucide-react'

const TABS = [
  { href: '/',         label: '홈',   Icon: Home },
  { href: '/rankings', label: '랭킹', Icon: BarChart2 },
  { href: '/presale',  label: '분양', Icon: Building2 },
  { href: '/profile',  label: 'MY',   Icon: User },
] as const

export function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="하단 탭 네비게이션"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[var(--line-default)]"
      style={{
        height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      data-capture-hide="true"
    >
      <div className="flex h-16 items-stretch">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center justify-center gap-1 min-h-[44px]"
              style={{ color: active ? 'var(--dj-orange)' : 'var(--fg-sec)', textDecoration: 'none' }}
            >
              <Icon size={22} strokeWidth={1.75} />
              <span className="text-xs font-bold">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
