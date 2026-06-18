/**
 * 네이버 부동산 매물 호가 수집 — Playwright 인터셉트 방식
 *
 * 원본: https://github.com/HarimxChoi/anti_bot_scraper (scraper_eng.py)
 * TypeScript/Node.js 완전 포팅
 *
 * 구버전 (raw fetch) → 신버전 (Playwright) 핵심 차이:
 *   ❌ 구: fetch() 직접 호출 → IP rate limit, null 반환
 *   ✅ 신: complex 페이지 방문 + API 응답 인터셉트 → IP limit 없음
 *
 * 성능 (원본 기준):
 *   - 단지당 상세 수집 800개 10분 (IP limit 없음)
 *   - DETAIL_WORKERS=12 동시 탭
 *   - 이미지/폰트/미디어 차단 (2-3x 속도)
 *
 * 실행: npx tsx scripts/crawl-naver-listings.ts [--dry-run] [--limit=50]
 */

import { chromium } from 'playwright'
import type { Page, BrowserContext } from 'playwright'
import { createClient }              from '@supabase/supabase-js'
import * as dotenv                   from 'dotenv'
import path                          from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// ─── 설정 (anti_bot_scraper 원본 기준값) ──────────────────────────────────────
const DETAIL_WORKERS  = 6       // 동시 탭 수 (원본: 12, 보수적으로 6 적용)
const MIN_ITEMS       = 3       // 유효 매물 최소 수 (이 미만 → skip)
const PAGE_TIMEOUT_MS = 15_000  // 페이지 로드 타임아웃
const API_WAIT_MS     = 3_000   // API 응답 대기 최대 시간 (ms)

const isDryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find(a => a.startsWith('--limit='))
const LIMIT    = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

// ─── 한국어 금액 파서 ──────────────────────────────────────────────────────────
// anti_bot_scraper parse_kr_money_to_won() TypeScript 포팅
// 반환값: 만원 단위 (1억 = 10000만원)
//
// 지원 형식:
//   "3억 8,000"  → 38000   "7.5억"     → 75000
//   "38,000"     → 38000   "38000만원" → 38000
//   "매매 3억"   → 30000   "380000000원" → 38000
function parseKrMoneyToMan(raw: string): number | null {
  if (!raw) return null

  // 거래 유형 접두어·공백·콤마 제거
  let t = raw.replace(/^(매매|전세|월세)\s*/, '').replace(/\s/g, '').replace(/,/g, '')

  const hasWon = t.includes('원')
  t = t.replace('원', '')

  let totalMan = 0

  // ① 억 파싱 (소수점 지원: "7.5억")
  const eokMatch = t.match(/(\d+(?:\.\d+)?)억/)
  if (eokMatch) {
    totalMan += parseFloat(eokMatch[1]) * 10_000  // 1억 = 10000만

    // 억 뒤 남은 숫자: "3억8000만" or "3억8000"
    const afterEok = t.slice(t.indexOf('억') + 1)
    const manSfx   = afterEok.match(/^(\d+)만/)
    const rawSfx   = afterEok.match(/^(\d+)$/)
    if (manSfx)      totalMan += parseInt(manSfx[1])
    else if (rawSfx) totalMan += parseInt(rawSfx[1])
  } else {
    // ② 억 없음
    const manMatch   = t.match(/(\d+)만/)
    const plainMatch = t.match(/^(\d+)$/)
    if (manMatch) {
      totalMan = parseInt(manMatch[1])
    } else if (plainMatch) {
      // 원 단위이면 만원으로 환산, 아니면 그대로 만원 단위
      totalMan = hasWon
        ? Math.round(parseInt(plainMatch[1]) / 10_000)
        : parseInt(plainMatch[1])
    }
  }

  return totalMan > 0 ? Math.round(totalMan) : null
}

// ─── 중앙값 ────────────────────────────────────────────────────────────────────
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

// ─── 평당가 배열 변환 ──────────────────────────────────────────────────────────
function toPricesPerPy(items: { priceMan: number; areaM2: number }[]): number[] {
  return items
    .filter(i => i.priceMan > 0 && i.areaM2 > 0)
    .map(i   => Math.round(i.priceMan / (i.areaM2 / 3.3058)))
    .filter(p => p >= 100 && p <= 99_999)  // listing_prices CHECK constraint
}

// ─── Playwright 컨텍스트 빌드 (map-naver-complexes-playwright.ts 동일 패턴) ───
async function buildContext(browser: import('playwright').Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:  { width: 1920, height: 1080 },
    locale:    'ko-KR',
    extraHTTPHeaders: {
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'referer':         'https://new.land.naver.com/',
    },
  })

  // anti_bot: navigator.webdriver 은닉
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).open = (u: string) => { location.href = u }
  })

  // 쿠키 주입 (NID_AUT, NID_SES)
  const rawCookie = process.env.NAVER_COOKIE ?? ''
  if (rawCookie) {
    const cookies = rawCookie.split(';').map(c => c.trim()).filter(Boolean).map(c => {
      const [name, ...rest] = c.split('=')
      return { name: name.trim(), value: rest.join('=').trim(), domain: '.naver.com', path: '/' }
    })
    await ctx.addCookies(cookies)
    console.log(`쿠키 주입: ${cookies.map(c => c.name).join(', ')}`)
  }

  // 이미지/폰트/미디어 차단 (anti_bot_scraper BLOCK_HEAVY_RESOURCES=True)
  // 실제 유저(광고차단기 사용) 패턴과 동일 → 탐지 완화 + 2-3x 속도
  await ctx.route('**/*', route => {
    const rt = route.request().resourceType()
    if (['image', 'font', 'media'].includes(rt)) return route.abort()
    return route.continue()
  })

  return ctx
}

// ─── 단지별 매물 수집: 페이지 방문 → API 응답 인터셉트 ───────────────────────
// anti_bot_scraper 핵심: 직접 API 호출 X → 브라우저가 자연스럽게 호출하게 유도
interface ListingItem { priceMan: number; areaM2: number }

async function fetchComplexListings(page: Page, complexNo: string): Promise<ListingItem[]> {
  const items: ListingItem[] = []
  let resolved = false

  const onResponse = async (response: import('playwright').Response) => {
    const url = response.url()
    // APT: /api/articles/complex/{no}   VL: /api/articles/house/{no}
    const isTarget =
      url.includes(`/api/articles/complex/${complexNo}`) ||
      url.includes(`/api/articles/house/${complexNo}`)
    if (!isTarget) return

    try {
      const json = await response.json().catch(() => null)
      if (!json || typeof json !== 'object') return

      const list = (json as Record<string, unknown>).articleList
      if (!Array.isArray(list)) return

      for (const raw of list) {
        const r = raw as Record<string, unknown>

        // 매매만 수집: tradeType='A1' 또는 tradeTypeName='매매'
        const tt   = String(r.tradeType    ?? '')
        const ttNm = String(r.tradeTypeName ?? '')
        if (tt !== 'A1' && ttNm !== '매매') continue

        // dealOrWarrantPrc: "3억 8,000만원" / "38,000" / "7.5억" 등
        const priceStr = String(r.dealOrWarrantPrc ?? '')
        // area2 = 전용면적(m²), area1 = 공급면적(m²) — 원본과 동일 필드명
        const areaStr  = String(r.area2 ?? r.area1 ?? r.exclusiveArea ?? '0')

        const priceMan = parseKrMoneyToMan(priceStr)
        const areaM2   = parseFloat(areaStr)

        if (!priceMan || areaM2 <= 0) continue
        items.push({ priceMan, areaM2 })
      }
      resolved = true
    } catch { /* 파싱 오류 무시 */ }
  }

  page.on('response', onResponse)

  try {
    // complex 페이지 방문 (a=APT&b=A1 → 매매 필터)
    // 브라우저가 /api/articles/complex/{no}?tradeType=A1 를 자동 호출
    await page.goto(
      `https://new.land.naver.com/complexes/${complexNo}?a=APT&b=A1`,
      { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS },
    )

    // API 응답 대기 (폴링 200ms 간격)
    const deadline = Date.now() + API_WAIT_MS
    while (!resolved && Date.now() < deadline) {
      await page.waitForTimeout(200)
    }
  } catch {
    // 타임아웃 → 수집된 것 그대로 반환
  }

  page.off('response', onResponse)
  return items
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  )

  const today = new Date().toISOString().slice(0, 10)
  console.log(`[crawl-naver-listings] Playwright 인터셉트 시작 — ${today} (dry-run: ${isDryRun})`)

  // 매핑된 단지 조회
  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, naver_complex_no')
    .not('naver_complex_no', 'is', null)
    .order('canonical_name')
    .limit(isFinite(LIMIT) ? LIMIT : 10_000)

  if (error || !complexes) {
    console.error('조회 실패:', error?.message)
    process.exit(1)
  }

  type ComplexRow = { id: string; canonical_name: string; naver_complex_no: string }
  const rows = complexes as ComplexRow[]
  console.log(`처리 대상: ${rows.length}개 단지, 워커: ${DETAIL_WORKERS}개 동시 탭\n`)

  // Playwright 초기화
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const ctx = await buildContext(browser)

  // 워커 탭 풀 생성 (anti_bot_scraper asyncio.Queue 패턴: 탭 생성 후 재사용)
  console.log(`탭 ${DETAIL_WORKERS}개 초기화 중...`)
  const tabPool: Page[] = []
  for (let i = 0; i < DETAIL_WORKERS; i++) {
    tabPool.push(await ctx.newPage())
  }

  const stats = { upserted: 0, skip: 0, error: 0 }
  const queue  = [...rows]

  // 각 탭이 공유 큐에서 단지를 꺼내 처리 (anti_bot_scraper worker 패턴)
  async function worker(tab: Page) {
    while (queue.length > 0) {
      const row = queue.shift()
      if (!row) break

      try {
        const items  = await fetchComplexListings(tab, row.naver_complex_no)
        const prices = toPricesPerPy(items)

        if (prices.length < MIN_ITEMS) {
          process.stdout.write(`[SKIP] ${row.canonical_name} — ${items.length}건 (유효 ${prices.length}건)\n`)
          stats.skip++
          continue
        }

        const medianPy = median(prices)
        process.stdout.write(`[OK] ${row.canonical_name} — ${items.length}건, ${medianPy.toLocaleString()}만원/평\n`)

        if (!isDryRun) {
          const { error: upsertErr } = await supabase
            .from('listing_prices')
            .upsert(
              {
                complex_id:    row.id,
                price_per_py:  medianPy,
                recorded_date: today,
                source:        'naver',
                created_by:    null,
              },
              { onConflict: 'complex_id,recorded_date,source', ignoreDuplicates: false },
            )
          if (upsertErr) {
            console.error(`[ERR] ${row.canonical_name}: ${upsertErr.message}`)
            stats.error++
          } else {
            stats.upserted++
          }
        } else {
          stats.upserted++
        }
      } catch (e) {
        console.error(`[ERR] ${row.canonical_name}: ${e instanceof Error ? e.message : String(e)}`)
        stats.error++
      }
    }
  }

  // DETAIL_WORKERS 탭을 동시에 실행 (Promise.all = asyncio.gather 동일)
  await Promise.all(tabPool.map(tab => worker(tab)))

  await browser.close()

  console.log('\n=== 결과 ===')
  console.log(`upserted: ${stats.upserted} / skip: ${stats.skip} / error: ${stats.error}`)
}

main().catch(e => { console.error(e); process.exit(1) })
