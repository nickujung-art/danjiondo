import { test, expect } from '@playwright/test'

/**
 * 검색 기능 골든패스
 *
 * 랜딩 페이지의 검색 폼은 action="/map" method="get" — 검색 결과는 /map?q= 에 표시된다.
 * 별도의 /search 라우트는 없다.
 */
test.describe('검색 기능', () => {
  // TODO: 랜딩 페이지가 콘텐츠 피드형으로 리디자인되며 input[name="q"] 검색창이 제거됨.
  // 검색 UX가 재확정되면 실제 진입 경로에 맞게 재작성할 것 (2026-07-06 skip 처리)
  test.skip('랜딩 페이지 검색 입력 창이 표시되고 활성화되어 있다', async ({ page }) => {
    await page.goto('/')
    const searchInput = page.locator('input[name="q"]').first()
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toBeEnabled()
    // placeholder 확인 — 실제 텍스트: "단지명, 지역으로 검색"
    await expect(searchInput).toHaveAttribute('placeholder', /단지명|지역|검색|아파트/)
  })

  test.skip('검색어 입력 후 제출 시 /map?q= 으로 이동하고 에러가 없다', async ({ page }) => {
    await page.goto('/')
    const searchInput = page.locator('input[name="q"]').first()
    await expect(searchInput).toBeVisible()
    await searchInput.fill('창원')
    await searchInput.press('Enter')
    await page.waitForLoadState('domcontentloaded')
    // 검색 폼 action="/map" → /map?q=창원
    expect(page.url()).toContain('/map')
    expect(decodeURIComponent(page.url())).toContain('창원')
    await expect(page.locator('text=Internal Server Error')).not.toBeVisible()
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('/map?q=창원 직접 접근 시 결과 목록 또는 사이드 패널이 표시된다', async ({ page }) => {
    await page.goto('/map?q=창원', { waitUntil: 'domcontentloaded' })
    expect(page.url()).toContain('/map')
    await expect(page.locator('main').first()).toBeVisible()
    await expect(page.locator('text=Internal Server Error')).not.toBeVisible()
    // main 콘텐츠가 비어있지 않아야 함
    const mainText = await page.locator('main').textContent().catch(() => '')
    expect(mainText!.length).toBeGreaterThan(0)
  })

  test('/map?q=없는단지 검색 시 에러 없이 페이지가 렌더된다', async ({ page }) => {
    await page.goto('/map?q=없는단지이름xyz999', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('text=Internal Server Error')).not.toBeVisible()
    await expect(page.locator('body')).toBeVisible()
  })
})
