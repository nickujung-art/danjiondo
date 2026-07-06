import { test, expect } from '@playwright/test'

test.describe('랜딩 페이지', () => {
  test('랜딩 페이지가 로드되고 h1 제목이 표시된다', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/단지온도|danji/i)
    // h1 — 현재 랜딩 페이지의 실제 텍스트: "오늘 신고가"
    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible()
    await expect(heading).not.toBeEmpty()
  })

  test('헤더 네비게이션이 렌더된다', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header').first()).toBeVisible()
    // 에러 페이지가 아닌지 확인
    await expect(page.locator('text=Internal Server Error')).not.toBeVisible()
  })

  // TODO: 랜딩 페이지가 콘텐츠 피드형으로 리디자인되며 input[name="q"] 검색창이 제거됨.
  // 검색 UX가 재확정되면 실제 진입 경로에 맞게 재작성할 것 (2026-07-06 skip 처리)
  test.skip('검색 입력창이 표시된다', async ({ page }) => {
    await page.goto('/')
    // 랜딩 페이지의 검색 input: name="q", placeholder="단지명, 지역으로 검색"
    const searchInput = page.locator('input[name="q"]').first()
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toBeEnabled()
  })

  test('main 콘텐츠 영역이 렌더된다', async ({ page }) => {
    await page.goto('/')
    const mainContent = page.locator('main, #__next').first()
    await expect(mainContent).toBeVisible()
  })
})
