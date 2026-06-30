'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, BarChart2, Building2, MoreHorizontal,
  Map, TrendingUp, Heart, FileText, Shield, Megaphone, X,
} from 'lucide-react'

const TABS = [
  { href: '/',         label: '홈',   Icon: Home },
  { href: '/rankings', label: '랭킹', Icon: BarChart2 },
  { href: '/presale',  label: '분양', Icon: Building2 },
] as const

type MoreItem = { href: string; label: string; Icon: React.ElementType } | null

const MORE_ITEMS: MoreItem[] = [
  { href: '/map',            label: '지도',              Icon: Map },
  { href: '/invest',         label: '투자 분석',         Icon: TrendingUp },
  { href: '/favorites',      label: '관심단지',           Icon: Heart },
  null,
  { href: '/legal/terms',    label: '이용약관',           Icon: FileText },
  { href: '/legal/privacy',  label: '개인정보처리방침',    Icon: Shield },
  { href: '/legal/ad-policy',label: '광고 정책',          Icon: Megaphone },
]

const MORE_PREFIXES = ['/map', '/invest', '/favorites', '/legal']

export function BottomTabBar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const moreActive = MORE_PREFIXES.some(p => pathname.startsWith(p))

  return (
    <>
      {/* 더보기 드로어 */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="더보기 메뉴"
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--line-subtle)]">
              <span style={{ font: '700 16px/1 var(--font-sans)', color: 'var(--fg-pri)' }}>
                더보기
              </span>
              <button
                onClick={() => setOpen(false)}
                className="flex items-center justify-center w-8 h-8"
                aria-label="닫기"
                style={{ color: 'var(--fg-sec)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>
            <div className="px-2 py-2">
              {MORE_ITEMS.map((item, idx) =>
                item === null ? (
                  <div key={idx} style={{ height: 1, background: 'var(--line-subtle)', margin: '4px 12px' }} />
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ color: 'var(--fg-pri)', textDecoration: 'none', font: '500 15px/1 var(--font-sans)' }}
                  >
                    <item.Icon size={20} strokeWidth={1.75} style={{ color: 'var(--fg-sec)', flexShrink: 0 }} />
                    {item.label}
                  </Link>
                )
              )}
            </div>
          </div>
        </>
      )}

      {/* 하단 탭바 (모바일만) */}
      <nav
        aria-label="하단 탭 네비게이션"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[var(--line-default)]"
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
          <button
            onClick={() => setOpen(true)}
            className="flex flex-1 flex-col items-center justify-center gap-1 min-h-[44px]"
            style={{
              color: open || moreActive ? 'var(--dj-orange)' : 'var(--fg-sec)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <MoreHorizontal size={22} strokeWidth={1.75} />
            <span className="text-xs font-bold">더보기</span>
          </button>
        </div>
      </nav>
    </>
  )
}
