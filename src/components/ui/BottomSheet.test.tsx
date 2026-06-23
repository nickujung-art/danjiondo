import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomSheet } from '@/components/ui/BottomSheet'

describe('BottomSheet', () => {
  it('renders title when open', () => {
    render(
      <BottomSheet open={true} onClose={vi.fn()} title="테스트 시트">
        <p>콘텐츠</p>
      </BottomSheet>
    )
    expect(screen.getByText('테스트 시트')).toBeDefined()
  })

  it('renders children when open=true', () => {
    render(
      <BottomSheet open={true} onClose={vi.fn()} title="시트">
        <p>자식 콘텐츠</p>
      </BottomSheet>
    )
    expect(screen.getByText('자식 콘텐츠')).toBeDefined()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open={true} onClose={onClose} title="시트">
        <p>콘텐츠</p>
      </BottomSheet>
    )
    const closeBtn = screen.getByRole('button', { name: '닫기' })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
