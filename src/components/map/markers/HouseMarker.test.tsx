import { render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { HouseMarker } from './HouseMarker'

// ── Test 1: badge='none' → 오렌지 색상 (#F97316) — recentPrice가 있어야 색상 표시
test('badge none일 때 오렌지 색상(#F97316) SVG가 렌더된다', () => {
  const { container } = render(
    <HouseMarker badge="none" recentPrice={50000} name="테스트 단지" />
  )
  expect(container.innerHTML).toContain('F97316')
})

// ── Test 2: badge='pre_sale' → 빨강 (#EF4444) — recentPrice가 있어야 색상 표시
test('badge pre_sale일 때 빨간 색상(#EF4444) 요소가 렌더된다', () => {
  const { container } = render(
    <HouseMarker badge="pre_sale" recentPrice={50000} name="분양 단지" />
  )
  expect(container.innerHTML).toContain('EF4444')
})

// ── Test 3: badge='new_build' → 민트 (#14B8A6) — recentPrice가 있어야 색상 표시
test('badge new_build일 때 민트 색상(#14B8A6) 요소가 렌더된다', () => {
  const { container } = render(
    <HouseMarker badge="new_build" recentPrice={50000} name="신축 단지" />
  )
  expect(container.innerHTML).toContain('14B8A6')
})

// ── Test 4: badge='hot' → 왕관 SVG <image> 렌더됨 (PNG + SVG filter 방식)
test('badge hot일 때 왕관 SVG image가 렌더된다', () => {
  const { container } = render(
    <HouseMarker badge="hot" recentPrice={null} name="핫 단지" />
  )
  // 왕관은 base64 PNG를 <image> 태그로 렌더 + feFlood filter로 색상 교체
  expect(container.querySelector('image')).not.toBeNull()
})

// ── Test 5: recentPrice=95000 → '9.5억' (축약 포맷, 핀 내부)
test('recentPrice=95000일 때 핀 내부에 "9.5억" 텍스트가 렌더된다', () => {
  render(
    <HouseMarker badge="none" recentPrice={95000} name="테스트 단지" />
  )
  expect(screen.getByText('9.5억')).toBeTruthy()
})

// ── Test 6: recentPrice=null → SVG text 요소 없음
test('recentPrice=null일 때 가격 텍스트 요소가 없다', () => {
  const { container } = render(
    <HouseMarker badge="none" recentPrice={null} name="테스트 단지" />
  )
  expect(container.querySelector('text')).toBeNull()
})

// ── Test 7: 1억 단위 가격 → '1억' 표시
test('recentPrice=10000일 때 "1억"이 표시된다', () => {
  render(
    <HouseMarker badge="none" recentPrice={10000} name="테스트 단지" />
  )
  expect(screen.getByText('1억')).toBeTruthy()
})

// ── Test 8: 1억 미만 → 만 단위 표시
test('recentPrice=8500일 때 "8500만"이 표시된다', () => {
  render(
    <HouseMarker badge="none" recentPrice={8500} name="테스트 단지" />
  )
  expect(screen.getByText('8500만')).toBeTruthy()
})
