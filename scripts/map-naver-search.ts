/**
 * 네이버 단지별 좌표 이동 + single-markers 인터셉트 방식 매핑
 *
 * 기존 격자 탐색 한계(커버리지 누락) 극복:
 * 각 DB 미매핑 단지 좌표로 지도 이동 → single-markers API 자동 호출 → 이름+좌표 매칭
 *
 * 실행: npx tsx scripts/map-naver-search.ts [--dry-run] [--limit=200]
 *
 * anti-bot: navigator.webdriver 숨김 · NAVER_COOKIE 주입 · 이미지/폰트 차단
 */

import { chromium, type Page } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { normalizeComplexName } from '../src/services/naver-land'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const isDryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find(a => a.startsWith('--limit='))
const LIMIT    = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

// ── 설정 ─────────────────────────────────────────────────────────────────────
const WORKERS     = 4      // 병렬 탭 수
const DWELL_MS    = 2_500  // 마커 로딩 대기 ms
const PAGE_TO_MS  = 15_000 // 페이지 timeout
const EXACT_DIST  = 300    // 좌표 매칭 허용 m

interface ComplexRow {
  id: string; canonical_name: string; lat: number; lng: number
}

interface NaverMarker {
  complexNo: string; complexName: string; lat: number; lng: number
}

// ── Haversine ─────────────────────────────────────────────────────────────────
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R    = 6_371_000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s    = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// ── 이름 유사도 ───────────────────────────────────────────────────────────────
function namesMatch(dbName: string, naverName: string): boolean {
  const nd = normalizeComplexName(dbName)
  const nn = normalizeComplexName(naverName)
  if (!nd || !nn) return false
  return nd.includes(nn) || nn.includes(nd)
}

// ── single-markers 응답 파싱 ─────────────────────────────────────────────────
function parseMarkers(json: unknown): NaverMarker[] {
  if (!json || typeof json !== 'object') return []
  // 숫자키 객체 또는 배열 두 형태 처리
  const items = Array.isArray(json) ? json : Object.values(json as Record<string, unknown>)
  return items.flatMap(item => {
    const m = item as Record<string, unknown>
    const complexNo   = String(m['markerId'] ?? '')
    const complexName = String(m['complexName'] ?? '')
    const lat = parseFloat(String(m['latitude']  ?? '0'))
    const lng = parseFloat(String(m['longitude'] ?? '0'))
    if (!complexNo || !complexName || !lat || !lng || isNaN(lat) || isNaN(lng)) return []
    return [{ complexNo, complexName, lat, lng }]
  })
}

// ── Playwright 컨텍스트 ───────────────────────────────────────────────────────
async function buildContext(browser: import('playwright').Browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 900 },
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
  // 이미지/폰트 차단 (속도 향상)
  await ctx.route('**/*', route => {
    const rt = route.request().resourceType()
    if (['image', 'font', 'media'].includes(rt)) return route.abort()
    return route.continue()
  })
  return ctx
}

// ── 단지 좌표로 이동 후 주변 마커 수집 ─────────────────────────────────────────
async function fetchMarkersAt(page: Page, lat: number, lng: number): Promise<NaverMarker[]> {
  const collected: NaverMarker[] = []

  const onResponse = async (response: import('playwright').Response) => {
    if (!response.url().includes('/api/complexes/single-markers')) return
    if (!response.ok()) return
    try {
      const json = await response.json().catch(() => null)
      if (json) collected.push(...parseMarkers(json))
    } catch { /* 무시 */ }
  }

  page.on('response', onResponse)

  try {
    // 단지 좌표로 zoom=16 지도 이동 (ms 파라미터: lat,lng,zoom)
    await page.goto(
      `https://new.land.naver.com/complexes?ms=${lat},${lng},16&a=APT&b=A1`,
      { waitUntil: 'domcontentloaded', timeout: PAGE_TO_MS },
    )
    await page.waitForTimeout(DWELL_MS)
  } catch { /* timeout 허용 */ }

  page.off('response', onResponse)
  return collected
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  )

  // DB 미매핑 단지 로드
  const allRows: ComplexRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('complexes')
      .select('id, canonical_name, lat, lng')
      .is('naver_complex_no', null)
      .not('lat', 'is', null).not('lng', 'is', null)
      .in('building_type', ['apt', 'officetel'])  // 아파트/오피스텔만
      .order('household_count', { ascending: false })              // 대단지 먼저
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    allRows.push(...(data as ComplexRow[]))
    if (data.length < 1000) break
    from += 1000
  }

  const targets = isFinite(LIMIT) ? allRows.slice(0, LIMIT) : allRows
  console.log(`\n[map-naver-search] Playwright 단지별 이동 방식`)
  console.log(`매핑 대상: ${targets.length}개 단지 | workers=${WORKERS} | dry-run=${isDryRun}\n`)
  if (targets.length === 0) { console.log('매핑할 단지 없음'); return }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const ctx     = await buildContext(browser)
  const tabPool = await Promise.all(Array.from({ length: WORKERS }, () => ctx.newPage()))

  const queue  = [...targets]
  const stats  = { mapped: 0, miss: 0, error: 0 }
  const mapped = new Set<string>()

  async function worker(tab: Page) {
    while (queue.length > 0) {
      const row = queue.shift()
      if (!row) break
      const idx = targets.length - queue.length

      try {
        const markers = await fetchMarkersAt(tab, row.lat, row.lng)

        let best: { marker: NaverMarker; dist: number } | null = null
        for (const marker of markers) {
          if (mapped.has(marker.complexNo)) continue
          if (!namesMatch(row.canonical_name, marker.complexName)) continue
          const d = distanceM({ lat: row.lat, lng: row.lng }, { lat: marker.lat, lng: marker.lng })
          if (d <= EXACT_DIST && (!best || d < best.dist)) best = { marker, dist: d }
        }

        if (!best) {
          process.stdout.write(`[${idx}/${targets.length}] MISS ${row.canonical_name} (마커 ${markers.length}개)\n`)
          stats.miss++
          continue
        }

        const { marker, dist } = best
        process.stdout.write(`[${idx}/${targets.length}] OK   ${row.canonical_name} → ${marker.complexNo} (${Math.round(dist)}m, "${marker.complexName}")\n`)

        if (!isDryRun) {
          const { error } = await supabase
            .from('complexes').update({ naver_complex_no: marker.complexNo }).eq('id', row.id)
          if (error) { console.error(`  [ERR] ${error.message}`); stats.error++; continue }
        }

        mapped.add(marker.complexNo)
        stats.mapped++
      } catch (e) {
        console.error(`[ERR] ${row.canonical_name}: ${e instanceof Error ? e.message : String(e)}`)
        stats.error++
      }
    }
  }

  await Promise.all(tabPool.map(tab => worker(tab)))
  await browser.close()

  console.log(`\n=== 결과 ===`)
  console.log(`매핑 성공: ${stats.mapped} / MISS: ${stats.miss} / 에러: ${stats.error}`)
  if (isDryRun) console.log('(dry-run — DB 미반영)')
}

main().catch(e => { console.error(e); process.exit(1) })
