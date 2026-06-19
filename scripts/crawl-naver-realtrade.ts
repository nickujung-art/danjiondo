/**
 * 네이버 단지 실거래 탭 데이터 수집 → transactions.area_type_id 재매핑
 *
 * A/B 타입 동일 전용면적 문제 해결:
 * 네이버 단지 페이지 실거래 탭에서 pyeongName2 포함 데이터를 추출
 * → 월/금액/층으로 transactions를 매칭해 area_type_id 재지정
 *
 * 전략:
 * 1단계: API 인터셉트 시도 (더 광범위한 패턴)
 * 2단계: API 없으면 DOM 파싱 (page.evaluate 로 타입별 실거래 목록 추출)
 *
 * 실행: npx tsx scripts/crawl-naver-realtrade.ts [--dry-run] [--limit=50] [--ab-only]
 *   --ab-only: A/B 중복 전용면적 단지만 대상 (우선순위)
 *
 * anti-bot: navigator.webdriver 숨김 · NAVER_COOKIE 주입 · 탭 풀
 */

import { chromium, type Page } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const isDryRun   = process.argv.includes('--dry-run')
const abOnly     = process.argv.includes('--ab-only')
const limitArg   = process.argv.find(a => a.startsWith('--limit='))
const LIMIT      = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

const DETAIL_WORKERS  = 3
const PAGE_TIMEOUT_MS = 18_000
const API_WAIT_MS     = 5_000

// 실거래 API 탐색 패턴 (광범위하게)
const TRADE_URL_PATTERNS = [
  '/real',
  '/deal',
  '/trade',
  '/article',
  'realPrices',
  'pyeongNo',
  'pyeongName',
  'dealAmount',
]

interface AreaTypeRow {
  id: string; pyeong_name: string; exclusive_area_m2: number; naver_pyeong_no: number | null
}

interface RealTrade {
  pyeongName: string   // "34A", "84B" 등
  dealYear:   number
  dealMonth:  number
  dealDay:    number
  dealAmount: number   // 만원
  floor:      number
  area:       number   // 전용면적 m²
}

// ── Playwright 컨텍스트 ─────────────────────────────────────────────────────
async function buildContext(browser: import('playwright').Browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:  { width: 1920, height: 1080 },
    locale:    'ko-KR',
    extraHTTPHeaders: {
      'accept-language': 'ko-KR,ko;q=0.9',
      'referer':         'https://new.land.naver.com/',
    },
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
  return ctx
}

// ── 1단계: API 인터셉트 ────────────────────────────────────────────────────
function parseTrades(arr: Record<string, unknown>[]): RealTrade[] {
  return arr.flatMap(item => {
    const pyeongName = String(item['pyeongName2'] ?? item['pyeongName'] ?? item['typeName'] ?? '')
    if (!pyeongName) return []

    const dealAmount = parseFloat(String(item['dealAmount'] ?? item['price'] ?? '0').replace(/[^0-9.]/g, ''))
    const floor      = parseInt(String(item['floor'] ?? '0'), 10)
    const area       = parseFloat(String(item['exclusiveArea'] ?? item['area'] ?? '0'))
    const dateStr    = String(item['dealDate'] ?? item['contractDate'] ?? '')

    const [year, month, day] = dateStr.includes('-')
      ? dateStr.split('-').map(Number)
      : [parseInt(dateStr.slice(0, 4)), parseInt(dateStr.slice(4, 6)), parseInt(dateStr.slice(6, 8) || '1')]

    if (!dealAmount || !year || !month) return []
    return [{ pyeongName, dealYear: year, dealMonth: month, dealDay: day || 1, dealAmount, floor: isNaN(floor) ? 0 : floor, area }]
  })
}

async function tryApiIntercept(page: Page, complexNo: string): Promise<{ trades: RealTrade[]; apiUrl: string }> {
  const trades: RealTrade[] = []
  let apiUrl = ''

  const onResponse = async (response: import('playwright').Response) => {
    const url = response.url()
    if (!response.ok()) return
    if (!TRADE_URL_PATTERNS.some(p => url.toLowerCase().includes(p.toLowerCase()))) return
    if (!url.includes('/api/')) return

    try {
      const json = await response.json().catch(() => null)
      if (!json || typeof json !== 'object') return

      const obj = json as Record<string, unknown>
      const arr = Array.isArray(json) ? json :
        (['list', 'items', 'realTradeList', 'tradeList', 'deals', 'data'].map(k => obj[k]).find(Array.isArray) as unknown[] | undefined)

      if (arr && arr.length > 0) {
        const firstItem = arr[0] as Record<string, unknown>
        const keys = Object.keys(firstItem)
        const hasPyeong = keys.some(k => k.toLowerCase().includes('pyeong') || k.toLowerCase().includes('type'))

        console.log(`\n  [API] ${url.replace('https://new.land.naver.com', '').slice(0, 80)}`)
        console.log(`  item keys: ${keys.slice(0, 8).join(', ')}`)

        if (hasPyeong) {
          apiUrl = url
          trades.push(...parseTrades(arr as Record<string, unknown>[]))
        }
      }
    } catch { /* 무시 */ }
  }

  page.on('response', onResponse)

  try {
    // 매매 탭
    await page.goto(
      `https://new.land.naver.com/complexes/${complexNo}?a=APT&b=A1`,
      { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS },
    )
    await page.waitForTimeout(2_000)

    // 실거래 탭 클릭 시도
    const tabSelectors = [
      'button:has-text("실거래")',
      'li:has-text("실거래")',
      '[class*="tab"]:has-text("실거래")',
      'a:has-text("실거래")',
    ]
    for (const sel of tabSelectors) {
      const el = page.locator(sel).first()
      if (await el.isVisible().catch(() => false)) {
        await el.click()
        console.log(`  [실거래 탭 클릭] selector: ${sel}`)
        break
      }
    }
    await page.waitForTimeout(API_WAIT_MS)
    await page.evaluate(() => window.scrollBy(0, 600))
    await page.waitForTimeout(1_500)
  } catch { /* 무시 */ }

  page.off('response', onResponse)
  return { trades, apiUrl }
}

// ── 2단계: DOM 파싱 (API 없을 때 폴백) ─────────────────────────────────────
async function tryDomParse(page: Page): Promise<RealTrade[]> {
  try {
    return await page.evaluate((): RealTrade[] => {
      // 평형별 실거래 데이터를 DOM에서 추출
      // 네이버 부동산 단지 페이지의 실거래 리스트 셀렉터 (버전에 따라 다를 수 있음)
      const rows = Array.from(document.querySelectorAll(
        '[class*="realPriceItem"], [class*="real-price-item"], [class*="trade-item"], [class*="RealPriceItem"]'
      ))

      return rows.flatMap(row => {
        const pyeongEl = row.querySelector('[class*="pyeong"], [class*="type"], [class*="area"]')
        const amountEl = row.querySelector('[class*="price"], [class*="amount"]')
        const dateEl   = row.querySelector('[class*="date"], [class*="Date"]')
        const floorEl  = row.querySelector('[class*="floor"], [class*="Floor"]')

        const pyeongName = pyeongEl?.textContent?.trim() ?? ''
        if (!pyeongName || !/\d+[A-C]?/.test(pyeongName)) return []

        const amountStr = amountEl?.textContent?.replace(/[^0-9]/g, '') ?? '0'
        const dealAmount = parseInt(amountStr, 10)
        const dateStr    = dateEl?.textContent?.trim() ?? ''
        const floorStr   = floorEl?.textContent?.trim() ?? '0'

        const [year, month] = dateStr.split('.').map(Number)
        if (!year || !month) return []

        return [{
          pyeongName,
          dealYear:   year,
          dealMonth:  month,
          dealDay:    1,
          dealAmount: isNaN(dealAmount) ? 0 : dealAmount,
          floor:      parseInt(floorStr, 10) || 0,
          area:       0,
        }]
      })
    })
  } catch {
    return []
  }
}

// ── area_type_id 재매핑 ─────────────────────────────────────────────────────
async function remapAreaTypes(
  supabase: ReturnType<typeof createClient>,
  complexId: string,
  complexName: string,
  trades: RealTrade[],
  areaTypes: AreaTypeRow[],
): Promise<{ updated: number; skip: number }> {
  const withType = trades.filter(t => /[A-C]$/.test(t.pyeongName))  // pyeongName에 A/B/C 타입 표기 있는 것만
  if (withType.length === 0) return { updated: 0, skip: trades.length }

  // pyeongName → area_type_id 매핑
  const pyeongMap = new Map<string, string>()
  for (const at of areaTypes) {
    if (at.pyeong_name) pyeongMap.set(at.pyeong_name, at.id)
  }

  let updated = 0, skip = 0

  for (const trade of withType) {
    const areaTypeId = pyeongMap.get(trade.pyeongName)
    if (!areaTypeId) { skip++; continue }

    if (isDryRun) {
      process.stdout.write(`  [DRY] ${complexName} ${trade.pyeongName} ${trade.dealYear}-${trade.dealMonth} ${trade.dealAmount}만\n`)
      updated++
      continue
    }

    const { data: matched } = await supabase
      .from('transactions')
      .select('id, area_type_id')
      .eq('complex_id', complexId)
      .eq('deal_type', 'sale')
      .is('cancel_date', null)
      .is('superseded_by', null)
      .eq('deal_year', trade.dealYear)
      .eq('deal_month', trade.dealMonth)
      .eq('floor', trade.floor)
      .limit(5)

    if (!matched?.length) { skip++; continue }

    for (const txn of matched) {
      if (txn.area_type_id === areaTypeId) continue
      const { error } = await supabase
        .from('transactions')
        .update({ area_type_id: areaTypeId })
        .eq('id', txn.id)
      if (!error) updated++
    }
  }
  return { updated, skip }
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  )

  // A/B 중복 전용면적 단지 조회 (--ab-only 시 해당 단지만)
  let complexQuery = supabase
    .from('complexes')
    .select('id, canonical_name, naver_complex_no')
    .not('naver_complex_no', 'is', null)

  if (abOnly) {
    // A/B 유형 있는 단지 (complex_area_types에 동일 전용면적 중복 있는 단지)
    const { data: abComplexIds } = await supabase.rpc('get_ab_type_complex_ids').catch(() => ({ data: null }))
    if (abComplexIds?.length) {
      complexQuery = complexQuery.in('id', abComplexIds)
    }
  }

  const { data: complexes, error } = await complexQuery
    .order('canonical_name')
    .limit(isFinite(LIMIT) ? LIMIT : 10_000)

  if (error || !complexes) { console.error('조회 실패:', error?.message); process.exit(1) }

  type Row = { id: string; canonical_name: string; naver_complex_no: string }
  const rows = complexes as Row[]

  console.log(`\n[crawl-naver-realtrade] 실거래 탭 탐색 + area_type_id 재매핑`)
  console.log(`대상: ${rows.length}개 단지 | dry-run: ${isDryRun} | ab-only: ${abOnly}\n`)

  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const ctx     = await buildContext(browser)
  const tabPool = await Promise.all(Array.from({ length: DETAIL_WORKERS }, () => ctx.newPage()))

  const queue = [...rows]
  const stats = { apiFound: 0, domFound: 0, updated: 0, skip: 0, error: 0 }
  const discoveredApis = new Set<string>()

  async function worker(tab: Page) {
    while (queue.length > 0) {
      const row = queue.shift()
      if (!row) break

      process.stdout.write(`\n[${row.canonical_name}] 실거래 탐색...`)

      try {
        // 단지 area_types 로드
        const { data: areaTypes } = await supabase
          .from('complex_area_types')
          .select('id, pyeong_name, exclusive_area_m2, naver_pyeong_no')
          .eq('complex_id', row.id)

        if (!areaTypes?.length) { process.stdout.write(' → area_types 없음\n'); continue }

        // 1단계: API 인터셉트
        const { trades: apiTrades, apiUrl } = await tryApiIntercept(tab, row.naver_complex_no)

        let trades = apiTrades
        if (apiUrl) {
          discoveredApis.add(apiUrl.replace(/\/\d+\//, '/{complexNo}/'))
          stats.apiFound++
        } else if (trades.length === 0) {
          // 2단계: DOM 파싱 폴백
          const domTrades = await tryDomParse(tab)
          if (domTrades.length > 0) {
            trades = domTrades
            stats.domFound++
          }
        }

        if (trades.length > 0) {
          const { updated, skip } = await remapAreaTypes(supabase, row.id, row.canonical_name, trades, areaTypes as AreaTypeRow[])
          stats.updated += updated
          stats.skip    += skip
          process.stdout.write(` → 거래 ${trades.length}건, 업데이트 ${updated}건\n`)
        } else {
          process.stdout.write(` → 거래 데이터 없음\n`)
        }

        await tab.waitForTimeout(700 + Math.random() * 500)
      } catch (e) {
        console.error(`\n[ERR] ${row.canonical_name}: ${e instanceof Error ? e.message : String(e)}`)
        stats.error++
      }
    }
  }

  await Promise.all(tabPool.map(tab => worker(tab)))
  await browser.close()

  console.log(`\n=== 결과 ===`)
  console.log(`API 발견: ${stats.apiFound}개 | DOM 파싱: ${stats.domFound}개`)
  console.log(`area_type_id 업데이트: ${stats.updated}건 | 스킵: ${stats.skip}건 | 에러: ${stats.error}건`)

  if (discoveredApis.size > 0) {
    console.log(`\n발견된 실거래 API:`)
    for (const api of discoveredApis) console.log(`  ${api}`)
  } else {
    console.log(`\n⚠️  실거래 전용 API 없음. 네이버가 별도 API 미제공.`)
    console.log(`   assign_area_types() nearest-match가 현재 최선입니다.`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
