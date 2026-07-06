import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppHeader } from '@/components/layout/AppHeader'

// usePathname mock — AppHeader 내부에서 호출
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('AppHeader', () => {
  it('renders without crashing', () => {
    render(<AppHeader />)
  })

  it('has aria-label "상단 헤더"', () => {
    render(<AppHeader />)
    expect(screen.getByRole('banner', { name: '상단 헤더' })).toBeDefined()
  })

  it('has data-capture-hide attribute', () => {
    const { container } = render(<AppHeader />)
    const header = container.querySelector('[data-capture-hide="true"]')
    expect(header).not.toBeNull()
  })

  it('contains 알림 button', () => {
    render(<AppHeader />)
    expect(screen.getByRole('button', { name: '알림' })).toBeDefined()
  })
})
