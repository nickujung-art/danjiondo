/**
 * 네이버 부동산 공식 평형 수집 + transactions.area_type_id 매핑
 *
 * 1단계: /api/complexes/overview/{complexNo} 인터셉트 → complex_area_types 적재
 * 2단계: SQL로 transactions.area_type_id 일괄 매핑 (±2㎡ nearest match)
 *
 * 실행: npx tsx scripts/crawl-naver-area-types.ts [--dry-run] [--limit=50] [--skip-assign]
 */

import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DETAIL_WORKERS  = 6
const PAGE_TIMEOUT_MS = 12_000
const API_WAIT_MS     = 3_000

const isDryRun   = process.argv.includes('--dry-run')
const skipAssign = process.argv.includes('--skip-assign')
const limitArg   = process.argv.find(a => a.startsWith('--limit='))
const LIMIT      = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

// ─── 네이버 pyeong 타입 ────────────────────────────────────────────────────────
interface NaverPyeong {
  pyeongNo:          number
  pyeongName2:       string   // "34A", "34B", "25"
  supplyAreaDouble:  number   // 공급면적
  exclusiveArea:     string   // 전용면적 (문자열)
  exclusivePyeong:   string   // 전용 평수
}

// ─── Playwright 컨텍스트 ──────────────────────────────────────────────────────
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

// ─── 단지 평형 수집 ───────────────────────────────────────────────────────────
async function fetchPyeongs(page: Page, complexNo: string): Promise<NaverPyeong[]> {
  let result: NaverPyeong[] = []
  let resolved = false

  const onResponse = async (response: import('playwright').Response) => {
    if (!response.url().includes(`/api/complexes/overview/${complexNo}`)) return
    try {
      const json = await response.json().catch(() => null)
      if (!json || typeof json !== 'object') return
      const pyeongs = (json as Record<string, unknown>).pyeongs
      if (!Array.isArray(pyeongs) || pyeongs.length === 0) return
      result = pyeongs as NaverPyeong[]
      resolved = true
    } catch { /* 무시 */ }
  }

  page.on('response', onResponse)
  try {
    await page.goto(
      `https://new.land.naver.com/complexes/${complexNo}?a=APT&b=A1`,
      { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS },
    )
    const deadline = Date.now() + API_WAIT_MS
    while (!resolved && Date.now() < deadline) {
      await page.waitForTimeout(200)
    }
  } catch { /* timeout — 수집된 것 사용 */ }
  page.off('response', onResponse)
  return result
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  )

  console.log(`[crawl-naver-area-types] 시작 (dry-run: ${isDryRun})`)

  // 네이버 매핑된 단지 조회
  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, naver_complex_no')
    .not('naver_complex_no', 'is', null)
    .order('canonical_name')
    .limit(isFinite(LIMIT) ? LIMIT : 10_000)

  if (error || !complexes) { console.error('조회 실패:', error?.message); process.exit(1) }

  type Row = { id: string; canonical_name: string; naver_complex_no: string }
  const rows = complexes as Row[]
  console.log(`처리 대상: ${rows.length}개 단지, 워커: ${DETAIL_WORKERS}개 탭\n`)

  // Playwright 초기화
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const ctx     = await buildContext(browser)
  const tabPool = await Promise.all(Array.from({ length: DETAIL_WORKERS }, () => ctx.newPage()))

  const stats = { upserted: 0, skip: 0, error: 0 }
  const queue = [...rows]

  async function worker(tab: Page) {
    while (queue.length > 0) {
      const row = queue.shift()
      if (!row) break

      try {
        const pyeongs = await fetchPyeongs(tab, row.naver_complex_no)

        if (pyeongs.length === 0) {
          process.stdout.write(`[SKIP] ${row.canonical_name} — 평형 없음\n`)
          stats.skip++
          continue
        }

        const labels = pyeongs.map(p => p.pyeongName2).join(', ')
        process.stdout.write(`[OK] ${row.canonical_name} — ${pyeongs.length}개 평형: ${labels}\n`)

        if (!isDryRun) {
          const records = pyeongs.map(p => ({
            complex_id:        row.id,
            naver_pyeong_no:   p.pyeongNo,
            pyeong_name:       p.pyeongName2,
            supply_area_m2:    p.supplyAreaDouble,
            exclusive_area_m2: parseFloat(p.exclusiveArea),
            exclusive_pyeong:  parseFloat(p.exclusivePyeong),
          }))

          const { error: upsertErr } = await supabase
            .from('complex_area_types')
            .upsert(records, { onConflict: 'complex_id,naver_pyeong_no', ignoreDuplicates: false })

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

  await Promise.all(tabPool.map(tab => worker(tab)))
  await browser.close()

  console.log('\n=== 1단계 결과 ===')
  console.log(`upserted: ${stats.upserted} / skip: ${stats.skip} / error: ${stats.error}`)

  // ── 2단계: transactions.area_type_id 일괄 매핑 ────────────────────────────
  if (isDryRun || skipAssign) {
    console.log('\n[dry-run / skip-assign] transactions 매핑 생략')
    return
  }

  console.log('\n[2단계] transactions.area_type_id 매핑 시작...')

  // nearest match: 같은 complex_id, ±2㎡ 이내, 가장 가까운 평형
  const { error: sqlErr, count } = await supabase.rpc('assign_area_types' as never)

  if (sqlErr) {
    // RPC 없으면 직접 SQL
    console.log('RPC 없음, 직접 SQL 실행...')
    const { error: directErr } = await supabase
      .from('transactions')
      .update({ area_type_id: null } as never)  // 타입 우회
      .not('complex_id', 'is', null)             // dummy, 실제 쿼리는 아래 raw SQL

    // Supabase JS SDK로 complex subquery UPDATE가 제한적이므로 RPC 사용 권장
    console.log('⚠️  supabase.rpc("assign_area_types") 가 없습니다.')
    console.log('   아래 SQL을 Supabase Dashboard에서 직접 실행하세요:\n')
    console.log(`UPDATE transactions t
SET area_type_id = (
  SELECT cat.id
  FROM complex_area_types cat
  WHERE cat.complex_id = t.complex_id
    AND ABS(cat.exclusive_area_m2 - t.area_m2) <= 2.0
  ORDER BY ABS(cat.exclusive_area_m2 - t.area_m2)
  LIMIT 1
)
WHERE t.area_type_id IS NULL
  AND EXISTS (
    SELECT 1 FROM complex_area_types WHERE complex_id = t.complex_id
  );`)
    console.log(`\n-- 결과 확인:
SELECT
  COUNT(*) FILTER (WHERE area_type_id IS NOT NULL) AS mapped,
  COUNT(*) FILTER (WHERE area_type_id IS NULL)     AS unmapped
FROM transactions
WHERE deal_type = 'sale' AND cancel_date IS NULL AND superseded_by IS NULL;`)
  } else {
    console.log(`매핑 완료: ${count ?? '?'}건`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
