'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  label: string
  href: string
  pendingCount?: number
  onClick?: () => void
}

interface AdminSidebarLinksProps {
  items: NavItem[]
  onItemClick?: () => void
}

export function AdminSidebarLinks({ items, onItemClick }: AdminSidebarLinksProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="어드민 메뉴">
      {items.map(item => {
        const isActive = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onItemClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderRadius: 6,
              fontFamily: 'var(--font-sans)',
              fontWeight: isActive ? 700 : 500,
              fontSize: 14,
              lineHeight: 1,
              color: isActive ? 'var(--fg-pri)' : 'var(--fg-sec)',
              background: isActive ? 'var(--bg-surface-2)' : 'transparent',
              textDecoration: 'none',
              marginBottom: 2,
            }}
          >
            <span>{item.label}</span>
            {(item.pendingCount ?? 0) > 0 && (
              <span
                aria-label={`미처리 ${item.pendingCount}건`}
                style={{
                  minWidth: 20,
                  height: 20,
                  padding: '0 6px',
                  borderRadius: 10,
                  background: 'var(--fg-negative)',
                  color: '#fff',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  fontSize: 11,
                  lineHeight: '20px',
                  textAlign: 'center',
                  display: 'inline-block',
                }}
              >
                {(item.pendingCount ?? 0) > 99 ? '99+' : item.pendingCount}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
