/**
 * 네이버 단지 페이지에서 평형 정보를 주는 API 엔드포인트 탐색용 스크립트
 * 실행: npx tsx scripts/discover-naver-area-api.ts
 */

import { chromium } from 'playwright'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const TEST_COMPLEX_NO = '112307' // 용지더샵레이크파크

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  const rawCookie = process.env.NAVER_COOKIE ?? ''
  if (rawCookie) {
    const cookies = rawCookie.split(';').map(c => c.trim()).filter(Boolean).map(c => {
      const [name, ...rest] = c.split('=')
      return { name: name.trim(), value: rest.join('=').trim(), domain: '.naver.com', path: '/' }
    })
    await ctx.addCookies(cookies)
  }
  await ctx.route('**/*', route => {
    const rt = route.request().resourceType()
    if (['image', 'font', 'media'].includes(rt)) return route.abort()
    return route.continue()
  })

  const page = await ctx.newPage()

  // new.land.naver.com/api/ 응답 전부 캡처
  page.on('response', async response => {
    const url = response.url()
    if (!url.includes('new.land.naver.com/api/')) return
    if (response.status() !== 200) return

    try {
      const json = await response.json().catch(() => null)
      if (!json || typeof json !== 'object') return

      const keys = Object.keys(json as object)
      const text = JSON.stringify(json).slice(0, 300)

      // 평형 관련 키워드가 있는 응답만 출력
      const isAreaRelated = text.includes('area') || text.includes('Area') ||
        text.includes('pyeong') || text.includes('Pyeong') ||
        text.includes('평') || text.includes('전용') || text.includes('공급')

      console.log(`\n[${response.status()}] ${url.replace('https://new.land.naver.com', '')}`)
      console.log(`  keys: ${keys.join(', ')}`)
      if (isAreaRelated) {
        console.log(`  ★ AREA RELATED ★`)
        console.log(`  preview: ${text}`)
      }
    } catch { /* ignore */ }
  })

  console.log(`complexNo=${TEST_COMPLEX_NO} 페이지 방문 중...`)
  await page.goto(
    `https://new.land.naver.com/complexes/${TEST_COMPLEX_NO}?a=APT&b=A1`,
    { waitUntil: 'domcontentloaded', timeout: 15000 },
  )
  await page.waitForTimeout(4000)

  await browser.close()
  console.log('\n탐색 완료.')
}

main().catch(e => { console.error(e); process.exit(1) })
