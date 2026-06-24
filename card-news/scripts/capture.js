/**
 * capture.js — HTML 문자열 → 1080×1080 PNG (Puppeteer)
 */
import puppeteer from 'puppeteer'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

let _browser = null

async function getBrowser() {
  if (!_browser) {
    _browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
        '--disable-font-subpixel-positioning',
      ],
    })
  }
  return _browser
}

export async function closeBrowser() {
  if (_browser) { await _browser.close(); _browser = null }
}

/**
 * HTML 문자열을 1080×1080 PNG로 캡처
 * @param {string} htmlString - 완전한 HTML 문서
 * @param {string} outputPath - PNG 저장 경로
 */
export async function captureCard(htmlString, outputPath) {
  const tempFile = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.html`
  const tempPath = join(ROOT, tempFile)
  writeFileSync(tempPath, htmlString, 'utf-8')

  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(tempPath).href, { waitUntil: 'load', timeout: 15000 })

    // 폰트 로드 대기
    await page.evaluate(() => document.fonts.ready)
    await new Promise((r) => setTimeout(r, 300))

    await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1080 } })
  } finally {
    await page.close()
    if (existsSync(tempPath)) unlinkSync(tempPath)
  }
}

/**
 * 단일 HTML 파일 캡처 (디버그용)
 * node scripts/capture.js <html-file> <output.png>
 */
if (process.argv[2]) {
  const { readFileSync } = await import('fs')
  const htmlPath = resolve(process.argv[2])
  const outPath = resolve(process.argv[3] ?? 'output.png')
  const htmlStr = readFileSync(htmlPath, 'utf-8')
  await captureCard(htmlStr, outPath)
  await closeBrowser()
  console.log(`Saved: ${outPath}`)
}
