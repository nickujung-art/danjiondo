/**
 * 네이버 부동산 매물 호가 수집 스크립트
 *
 * 실행: npx tsx scripts/crawl-naver-listings.ts [--dry-run] [--limit=50]
 *
 * 전제: scripts/map-naver-complexes.ts로 naver_complex_no가 매핑된 후 실행
 *
 * 알고리즘:
 *   1. complexes WHERE naver_complex_no IS NOT NULL 조회
 *   2. 각 단지에서 fetchNaverListings(complexNo) 호출 (최대 3페이지)
 *   3. 평당가(만원/평) = priceMan / (areaM2 / 3.3058) 로 계산
 *   4. 매물 수 < MIN_ITEMS(3) → skip
 *   5. 중앙값 평당가 계산
 *   6. listing_prices UPSERT (source='naver', recorded_date=오늘)
 *
 * RESEARCH.md §4.3: onConflict='complex_id,recorded_date,source' (이미 실행 시 덮어씀)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import { fetchNaverListings, NaverRateLimitError } from '../src/services/naver-land'
import type { ArticleListItem } from '../src/services/naver-land'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const isDryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find(a => a.startsWith('--limit='))
const LIMIT     = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

const CONCURRENCY = 2
const SLEEP_MS    = 1500
const MIN_ITEMS   = 3     // 최소 매물 수 (RESEARCH.md §4.2)
const MAX_PAGES   = 3     // 최대 페이지 수

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
)

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 중앙값 계산
 */
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * 매물 목록에서 평당가 배열 추출
 * 평당가(만원/평) = priceMan / (areaM2 / 3.3058)
 * RESEARCH.md §4.1: areaM2 <= 0 → skip (division by zero 방지)
 */
function toPricesPerPy(items: ArticleListItem[]): number[] {
  const result: number[] = []
  for (const item of items) {
    if (item.areaM2 <= 0 || item.priceMan <= 0) continue
    const py = item.areaM2 / 3.3058
    const pricePerPy = Math.round(item.priceMan / py)
    // listing_prices CHECK: price_per_py BETWEEN 100 AND 99999
    if (pricePerPy >= 100 && pricePerPy <= 99999) {
      result.push(pricePerPy)
    }
  }
  return result
}

/**
 * 모든 페이지 매물 수집 (최대 MAX_PAGES)
 */
async function collectAllListings(complexNo: string): Promise<ArticleListItem[]> {
  const allItems: ArticleListItem[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { items, hasMore } = await fetchNaverListings(complexNo, page)
    allItems.push(...items)
    if (!hasMore) break
    if (page < MAX_PAGES) await sleep(SLEEP_MS)
  }
  return allItems
}

interface ComplexRow {
  id:                string
  canonical_name:    string
  naver_complex_no:  string
}

async function processComplex(row: ComplexRow, today: string): Promise<'upserted' | 'skip' | 'error' | 'ratelimit'> {
  try {
    const items = await collectAllListings(row.naver_complex_no)
    const prices = toPricesPerPy(items)

    if (prices.length < MIN_ITEMS) {
      console.log(`[SKIP] ${row.canonical_name} — 매물 ${items.length}건 (유효 ${prices.length}건, 최소 ${MIN_ITEMS}건 미달)`)
      return 'skip'
    }

    const medianPy = median(prices)
    console.log(`[OK] ${row.canonical_name} — 매물 ${items.length}건, 중앙값 ${medianPy.toLocaleString()}만원/평`)

    if (!isDryRun) {
      const { error } = await supabase
        .from('listing_prices')
        .upsert(
          {
            complex_id:    row.id,
            price_per_py:  medianPy,
            recorded_date: today,
            source:        'naver',
            created_by:    null,   // Pitfall 3: FK nullable (RESEARCH.md §Common Pitfalls)
          },
          { onConflict: 'complex_id,recorded_date,source', ignoreDuplicates: false },
        )
      if (error) {
        console.error(`[ERROR] ${row.canonical_name}: ${error.message}`)
        return 'error'
      }
    }

    return 'upserted'
  } catch (err) {
    if (err instanceof NaverRateLimitError) return 'ratelimit'
    console.error(`[ERROR] ${row.canonical_name}: ${String(err)}`)
    return 'error'
  }
}

async function processInChunks<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item === undefined) break
      await fn(item)
      await sleep(SLEEP_MS)
    }
  })
  await Promise.all(workers)
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  console.log(`[crawl-naver-listings] 시작 — ${today} (dry-run: ${isDryRun})`)

  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, naver_complex_no')
    .not('naver_complex_no', 'is', null)
    .order('canonical_name')
    .limit(isFinite(LIMIT) ? LIMIT : 10000)

  if (error) throw error

  const rows = (complexes ?? []) as ComplexRow[]
  console.log(`처리 대상: ${rows.length}개 단지`)

  const stats = { upserted: 0, skip: 0, error: 0 }
  let rateLimited = false

  await processInChunks(
    rows,
    async (row) => {
      if (rateLimited) return
      const result = await processComplex(row, today)
      if (result === 'ratelimit') {
        console.error('[RATE-LIMIT] 네이버 API 429 — 중단. 5~30분 후 재실행하세요.')
        rateLimited = true
        return
      }
      stats[result]++
    },
    CONCURRENCY,
  )

  console.log(`\n=== 결과 ===`)
  if (rateLimited) {
    console.log(`upserted: ${stats.upserted} / skip: ${stats.skip} / error: ${stats.error}`)
    console.log('⚠ Rate limit으로 조기 중단됨. 5~30분 후 재실행 필요.')
  } else {
    console.log(`upserted: ${stats.upserted} / skip: ${stats.skip} / error: ${stats.error}`)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
