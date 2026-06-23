import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BottomTabBar } from '@/components/layout/BottomTabBar'

// usePathname mock — BottomTabBar 내부에서 호출
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('BottomTabBar', () => {
  it('renders without crashing', () => {
    render(<BottomTabBar />)
  })

  it('has aria-label "하단 탭 네비게이션"', () => {
    render(<BottomTabBar />)
    expect(screen.getByRole('navigation', { name: '하단 탭 네비게이션' })).toBeDefined()
  })

  it('has data-capture-hide attribute', () => {
    const { container } = render(<BottomTabBar />)
    const nav = container.querySelector('[data-capture-hide="true"]')
    expect(nav).not.toBeNull()
  })

  it('renders exactly 4 tab links', () => {
    render(<BottomTabBar />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(4)
  })

  it('renders 홈/랭킹/분양/MY labels', () => {
    render(<BottomTabBar />)
    expect(screen.getByText('홈')).toBeDefined()
    expect(screen.getByText('랭킹')).toBeDefined()
    expect(screen.getByText('분양')).toBeDefined()
    expect(screen.getByText('MY')).toBeDefined()
  })
})
