import Link from 'next/link'
import { AdminSidebarLinks } from './AdminSidebarLinks'

interface PendingCounts {
  reports: number
  ads: number
  gps: number
  presale: number
}

interface NavItem {
  label: string
  href: string
  pendingCount?: number
}

export function buildNavItems(pendingCounts: PendingCounts): NavItem[] {
  return [
    { label: '대시보드', href: '/admin/status' },
    { label: '회원 관리', href: '/admin/members' },
    { label: '신고 관리', href: '/admin/reports', pendingCount: pendingCounts.reports },
    { label: '광고 관리', href: '/admin/ads', pendingCount: pendingCounts.ads },
    { label: '중개사 관리', href: '/admin/realtors' },
    { label: 'GPS 검증', href: '/admin/gps-requests', pendingCount: pendingCounts.gps },
    { label: '카드뉴스 관리', href: '/admin/cardnews' },
    { label: '카드뉴스 빌더', href: '/admin/cardnews/builder' },
    { label: '시세 입력', href: '/admin/listing-prices' },
    { label: '재개발 관리', href: '/admin/redevelopment' },
    { label: '분양 검수', href: '/admin/presale-discoveries', pendingCount: pendingCounts.presale },
  ]
}

interface AdminSidebarProps {
  pendingCounts: PendingCounts
}

export function AdminSidebar({ pendingCounts }: AdminSidebarProps) {
  const items = buildNavItems(pendingCounts)

  return (
    <aside
      aria-label="어드민 사이드바"
      className="admin-sidebar"
      style={{
        width: 240,
        flexShrink: 0,
        background: '#fff',
        borderRight: '1px solid var(--line-default)',
        padding: '16px 8px',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          padding: '0 8px 16px',
          borderBottom: '1px solid var(--line-subtle)',
          marginBottom: 8,
        }}
      >
        <Link href="/" className="dj-logo" style={{ marginBottom: 4, display: 'inline-flex' }}>
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
        <span
          style={{
            display: 'block',
            font: '500 11px/1 var(--font-sans)',
            color: 'var(--fg-tertiary)',
            marginTop: 4,
          }}
        >
          어드민
        </span>
      </div>
      <AdminSidebarLinks items={items} />
    </aside>
  )
}
