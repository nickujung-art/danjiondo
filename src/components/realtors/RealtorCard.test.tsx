import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { RealtorCard } from './RealtorCard'

const mockRealtor = {
  id: 'test-id',
  name: '홍길동',
  agency_name: '단지온도 부동산',
  phone: '010-1234-5678',
  description: null,
  image_url: null,
  is_active: true,
  license_no: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('RealtorCard', () => {
  it('renders tel: link with digits only', () => {
    const { container } = render(<RealtorCard realtor={mockRealtor} />)
    const link = container.querySelector('a[href^="tel:"]')
    expect(link?.getAttribute('href')).toBe('tel:01012345678')
  })

  it('renders initials avatar when no image_url', () => {
    const { getByText } = render(<RealtorCard realtor={mockRealtor} />)
    expect(getByText('홍길')).toBeTruthy()
  })

  it('renders image when image_url is set', () => {
    const realtorWithImg = { ...mockRealtor, image_url: 'https://example.com/photo.jpg' }
    const { container } = render(<RealtorCard realtor={realtorWithImg} />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.com/photo.jpg')
  })
})
