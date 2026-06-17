/**
 * 네이버 부동산 단지 번호(naver_complex_no) 매핑 — anti_bot_scraper 기법 적용
 *
 * 실행: npx tsx scripts/map-naver-complexes-playwright.ts [--dry-run] [--limit=200]
 *
 * 원본: https://github.com/HarimxChoi/anti_bot_scraper (scraper_eng.py)
 *
 * 전략:
 *   - 도메인: new.land.naver.com/complexes?ms=...&a=APT&b=A1
 *   - 메이저 이동: goto() (중심점 16개)
 *   - 미세 탐색: 마우스 드래그 steps=20 (Bézier) — gridSweep
 *   - 포지션 추적: URL 디코딩 불가 → 자체 state 유지
 *   - 줌: URL 3번째 파라미터는 여전히 정수 → wheelToZoom에서 읽기
 */

import { chromium, type Page } from 'playwright'
import { createClient }        from '@supabase/supabase-js'
import * as dotenv             from 'dotenv'
import path                    from 'path'
import { normalizeComplexName, haversineDistanceM } from '../src/services/naver-land'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const isDryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find(a => a.startsWith('--limit='))
const LIMIT    = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity

// ─── 설정 (anti_bot_scraper 기본값) ─────────────────────────────────────────
const ZOOM        = 14    // 단지(complex) 마커 줌 레벨 (15+ = 개별 매물 마커로 전환됨)
const GRID_RINGS  = 2     // gridSweep 링 수 (2 = 16 포인트/center → 커버리지 확장)
const GRID_STEP   = 480   // 그리드 스텝 (픽셀)
const SWEEP_DWELL = 600   // 각 포인트 대기 (ms)
const EXACT_DIST  = 200   // exact match 거리 (m)

// 창원/김해 커버 BBOX
const BBOXES = [
  { name: '창원북부', latMin: 35.22, latMax: 35.30, lngMin: 128.60, lngMax: 128.72 },
  { name: '마산',    latMin: 35.17, latMax: 35.24, lngMin: 128.52, lngMax: 128.60 },
  { name: '진해',    latMin: 35.12, latMax: 35.20, lngMin: 128.66, lngMax: 128.78 },
  { name: '창원남부', latMin: 35.19, latMax: 35.25, lngMin: 128.60, lngMax: 128.70 },
  { name: '김해',    latMin: 35.18, latMax: 35.35, lngMin: 128.74, lngMax: 128.95 },
]
const CENTER_STEP = 0.06  // 중심점 간격 (도)

interface MapState { lat: number; lng: number; zoom: number }
interface NaverMarker { complexNo: string; complexName: string; lat: number; lng: number }
interface ComplexRow {
  id: string; canonical_name: string; name_normalized: string; lat: number; lng: number
}

// ─── Mercator 투영 (anti_bot_scraper ll_to_pixel / pixel_to_ll 동일) ─────────

function llToPixel(lat: number, lon: number, z: number): [number, number] {
  const scale = 256 * Math.pow(2, z)
  const x     = (lon + 180.0) / 360.0 * scale
  const siny  = Math.sin(lat * Math.PI / 180)
  const y     = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale
  return [x, y]
}

function pixelToLl(x: number, y: number, z: number): [number, number] {
  const scale = 256 * Math.pow(2, z)
  const lon   = x / scale * 360.0 - 180.0
  const n     = Math.PI - 2.0 * Math.PI * y / scale
  const lat   = Math.atan(Math.sinh(n)) * 180 / Math.PI
  return [lat, lon]
}

// ─── 줌만 URL에서 읽기 (lat/lon은 인코딩되어 파싱 불가) ──────────────────────

async function readZoomFromUrl(page: Page): Promise<number | null> {
  try {
    const ms = new URL(page.url()).searchParams.get('ms')
    if (!ms) return null
    const z = parseFloat(ms.split(',')[2])
    return isNaN(z) ? null : z
  } catch { return null }
}

// ─── anti_bot: 마우스 드래그로 이동 (Bézier steps=20), 자체 state 추적 ────────

async function dragToLatlon(
  page: Page,
  state: MapState,
  targetLat: number,
  targetLng: number,
  tolerancePx = 3.5,
) {
  for (let i = 0; i < 18; i++) {
    const [x1, y1] = llToPixel(state.lat, state.lng, state.zoom)
    const [x2, y2] = llToPixel(targetLat, targetLng, state.zoom)
    const dx   = x2 - x1
    const dy   = y2 - y1
    const dist = Math.hypot(dx, dy)

    if (dist <= tolerancePx) return

    // 최대 800px 드래그 (사람은 화면 전체를 한 번에 드래그하지 않음)
    const step = Math.min(800.0, dist)
    const r    = step / (dist + 1e-9)
    const mx   = dx * r
    const my   = dy * r

    // 뷰포트 중심 (960, 540)에서 드래그, steps=20 부드러운 곡선
    await page.mouse.move(960, 540)
    await page.mouse.down()
    await page.mouse.move(960 - mx, 540 - my, { steps: 20 })
    await page.mouse.up()
    await page.waitForTimeout(350)

    // 자체 state 업데이트 (드래그 후 지도 중심 = 기존 중심 + 드래그 벡터)
    const [newLat, newLng] = pixelToLl(x1 + mx, y1 + my, state.zoom)
    state.lat = newLat
    state.lng = newLng
  }
}

// ─── anti_bot: 마우스 휠로 단계적 줌 ──────────────────────────────────────────

async function wheelToZoom(page: Page, state: MapState, targetZoom: number, stepDelay = 300) {
  for (let i = 0; i < 20; i++) {
    const z = (await readZoomFromUrl(page)) ?? state.zoom
    state.zoom = z
    if (Math.round(z) === targetZoom) return

    await page.mouse.move(960, 540)
    await page.mouse.wheel(0, targetZoom > Math.round(z) ? -300 : 300)
    await page.waitForTimeout(stepDelay)
  }
}

// ─── anti_bot: 인간적 재센터링 (zoom out → drag → zoom in → 미세조정) ─────────

async function humanLikeRecenter(page: Page, state: MapState, lat: number, lng: number, zoom: number) {
  const randOut = Math.floor(Math.random() * 4) + 9
  await wheelToZoom(page, state, randOut)
  await dragToLatlon(page, state, lat, lng)
  await wheelToZoom(page, state, zoom)
  await dragToLatlon(page, state, lat, lng)
}

// ─── anti_bot: 그리드 스윕 (상/하 행만 — 예측 불가 패턴) ─────────────────────

async function gridSweep(page: Page, state: MapState) {
  const [cx, cy] = llToPixel(state.lat, state.lng, state.zoom)
  const coords: [number, number][] = []

  for (let r = 1; r <= GRID_RINGS; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dy of [-r, r]) {
        coords.push(pixelToLl(cx + dx * GRID_STEP, cy + dy * GRID_STEP, state.zoom))
      }
    }
  }

  for (const [lat_, lng_] of coords) {
    await dragToLatlon(page, state, lat_, lng_)
    await page.mouse.wheel(0, -40)  // 마커 재로딩 트리거
    await page.waitForTimeout(SWEEP_DWELL)
  }
}

// ─── 마커 응답 파싱 ───────────────────────────────────────────────────────────

function parseMarkerList(list: unknown[]): NaverMarker[] {
  return list.flatMap(item => {
    const m         = item as Record<string, unknown>
    // 실제 필드: markerId (complexNo 아님), complexName, latitude, longitude
    const complexNo   = String(m['markerId']   ?? m['complexNo'] ?? '')
    const complexName = String(m['complexName'] ?? m['name']      ?? '')
    const lat = parseFloat(String(m['latitude']  ?? m['lat']  ?? '0'))
    const lng = parseFloat(String(m['longitude'] ?? m['lng']  ?? '0'))
    if (!complexNo || !complexName || !lat || !lng) return []
    return [{ complexNo, complexName, lat, lng }]
  })
}

function parseMarkers(json: unknown): NaverMarker[] {
  if (!json) return []
  // 응답이 배열 자체인 경우 (new.land.naver.com /api/complexes/single-markers/2.0)
  if (Array.isArray(json)) return parseMarkerList(json)
  if (typeof json !== 'object') return []
  // 래핑된 경우 (이전 API 형식 fallback)
  const obj  = json as Record<string, unknown>
  const list = (obj['complexList'] ?? obj['markerList'] ?? obj['result']) as unknown[]
  if (!Array.isArray(list)) return []
  return parseMarkerList(list)
}

// ─── DB 단지 매칭 ─────────────────────────────────────────────────────────────

function matchComplex(marker: NaverMarker, complexes: ComplexRow[]): { row: ComplexRow; dist: number } | null {
  const normMarker = normalizeComplexName(marker.complexName)
  let best: { row: ComplexRow; dist: number } | null = null

  for (const row of complexes) {
    const nameMatch =
      row.name_normalized.includes(normMarker) || normMarker.includes(row.name_normalized)
    if (!nameMatch) continue

    const dist = haversineDistanceM(
      { lat: row.lat, lng: row.lng },
      { lat: marker.lat, lng: marker.lng },
    )
    if (dist < EXACT_DIST && (!best || dist < best.dist)) best = { row, dist }
  }
  return best
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  )

  // ① DB 단지 로드
  const allRows: ComplexRow[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('complexes').select('id, canonical_name, name_normalized, lat, lng')
      .is('naver_complex_no', null).not('lat', 'is', null).not('lng', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    allRows.push(...(data as ComplexRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  const targets = isFinite(LIMIT) ? allRows.slice(0, LIMIT) : allRows
  console.log(`\n[map-naver-complexes-playwright] anti_bot_scraper 기법 적용`)
  console.log(`매핑 대상: ${targets.length}개 단지 (dry-run: ${isDryRun})\n`)
  if (targets.length === 0) { console.log('매핑할 단지 없음'); return }

  // ② 중심점 격자 생성 (0.06° 간격)
  const centers: { name: string; lat: number; lng: number }[] = []
  for (const bbox of BBOXES) {
    for (let lat = bbox.latMin + CENTER_STEP / 2; lat < bbox.latMax; lat += CENTER_STEP) {
      for (let lng = bbox.lngMin + CENTER_STEP / 2; lng < bbox.lngMax; lng += CENTER_STEP) {
        centers.push({ name: bbox.name, lat, lng })
      }
    }
  }
  console.log(`탐색 중심점: ${centers.length}개 (gridSweep rings=${GRID_RINGS} per center)\n`)

  // ③ Playwright 브라우저 (1920×1080 — anti_bot_scraper 동일)
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:  { width: 1920, height: 1080 },
    locale:    'ko-KR',
    extraHTTPHeaders: {
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'referer':         'https://new.land.naver.com/',
    },
  })

  // anti_bot: navigator.webdriver 숨김
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).open = (u: string) => { location.href = u }
  })

  // 쿠키 주입
  const naverCookie = process.env.NAVER_COOKIE ?? ''
  if (naverCookie) {
    const cookies = naverCookie.split(';').map(c => c.trim()).filter(Boolean).map(c => {
      const [name, ...rest] = c.split('=')
      return { name: name.trim(), value: rest.join('=').trim(), domain: '.naver.com', path: '/' }
    })
    await context.addCookies(cookies)
    console.log(`쿠키 주입: ${cookies.map(c => c.name).join(', ')}`)
  }

  const page = await context.newPage()

  // 이미지/폰트/미디어 차단 (2-3x 속도 향상 + 실제 사용자와 동일 패턴)
  await page.route('**/*', route => {
    const rt = route.request().resourceType()
    if (['image', 'font', 'media'].includes(rt)) return route.abort()
    return route.continue()
  })

  // ④ 마커 응답 인터셉트
  const collected = new Map<string, NaverMarker>()
  let interceptCount = 0

  page.on('response', async response => {
    const url    = response.url()
    const status = response.status()

    if (!url.includes('single-markers')) return

    if (!response.ok()) {
      console.log(`\n[차단] ${status} ${url.slice(0, 100)}`)
      return
    }
    try {
      const json    = await response.json().catch(() => null)
      if (!json) return
      const markers = parseMarkers(json)
      if (markers.length > 0) {
        interceptCount++
        for (const m of markers) {
          if (!collected.has(m.complexNo)) collected.set(m.complexNo, m)
        }
        process.stdout.write(`\r  누적 ${collected.size}개 (인터셉트 #${interceptCount})    `)
      }
    } catch { /* 무시 */ }
  })

  // ⑤ 초기 진입: new.land.naver.com/complexes (anti_bot_scraper 동일 URL 형식)
  const first = centers[0]
  const initUrl = `https://new.land.naver.com/complexes?ms=${first.lat},${first.lng},${ZOOM}&a=APT&b=A1`
  console.log(`[초기 진입] ${initUrl}`)

  const resp = await page.goto(initUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(e => {
    console.log(`  [goto 오류] ${e.message}`); return null
  })
  await page.waitForTimeout(3000)

  const finalUrl  = page.url()
  const urlStatus = resp?.status() ?? 'N/A'
  console.log(`  status: ${urlStatus}, 최종 URL: ${finalUrl.slice(0, 100)}`)
  await page.screenshot({ path: 'debug-naver-init.png' }).catch(() => {})

  // 초기 줌 확인 (URL 3번째 파라미터는 평문 정수)
  const initZoom = (await readZoomFromUrl(page)) ?? ZOOM
  console.log(`  줌: ${initZoom} (목표: ${ZOOM})`)

  if (urlStatus !== 200 && !finalUrl.includes('new.land.naver.com')) {
    console.log('\n⚠️  new.land.naver.com 접근 실패. debug-naver-init.png 확인')
    await browser.close()
    return
  }

  // ⑥ 각 중심점 탐색: goto() → state 초기화 → humanLikeRecenter → gridSweep
  for (let i = 0; i < centers.length; i++) {
    const { name, lat, lng } = centers[i]

    // 중심점이 2번째 이후면 goto()로 이동 (16개 중심점은 major navigation)
    if (i > 0) {
      const url = `https://new.land.naver.com/complexes?ms=${lat},${lng},${ZOOM}&a=APT&b=A1`
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(2000)
    }

    // goto() 후 현재 줌 읽기, 포지션은 우리가 알고 있는 좌표로 초기화
    const currentZoom = (await readZoomFromUrl(page)) ?? ZOOM
    const state: MapState = { lat, lng, zoom: currentZoom }

    process.stdout.write(`\r[${name}] ${i + 1}/${centers.length} → 수집 ${collected.size}개   `)

    // 줌이 목표와 다르면 먼저 맞추기
    if (Math.round(currentZoom) !== ZOOM) {
      await wheelToZoom(page, state, ZOOM)
    }

    // human-like 미세 조정 후 grid sweep
    await humanLikeRecenter(page, state, lat, lng, ZOOM)
    await gridSweep(page, state)
  }

  await browser.close()
  console.log(`\n수집된 네이버 단지: ${collected.size}개`)

  if (collected.size === 0) {
    console.log('⚠️  마커 0개. debug-naver-init.png 확인 — 차단 or URL 패턴 문제')
    return
  }

  // ⑦ 매칭 + UPDATE
  console.log('DB 매칭 중...')
  const stats = { exact: 0, miss: 0 }

  for (const [, marker] of collected) {
    const match = matchComplex(marker, targets)
    if (!match) { stats.miss++; continue }

    const { row, dist } = match
    if (isDryRun) {
      console.log(`[EXACT] ${row.canonical_name} → ${marker.complexNo} (${Math.round(dist)}m)`)
    } else {
      const { error } = await supabase
        .from('complexes').update({ naver_complex_no: marker.complexNo }).eq('id', row.id)
      if (error) console.error(`[ERROR] ${row.canonical_name}: ${error.message}`)
    }
    stats.exact++
  }

  const unmapped = targets.length - stats.exact
  console.log(`\n=== 결과 ===`)
  console.log(`수집: ${collected.size}개 / 매핑 성공: ${stats.exact} / DB미매칭: ${stats.miss}`)
  console.log(`미매핑 DB 단지: ${unmapped}개`)
  console.log(`매핑률: ${((stats.exact / targets.length) * 100).toFixed(1)}%`)
  if (isDryRun) console.log('\n(dry-run — DB 업데이트 없음)')
}

main().catch(e => { console.error(e); process.exit(1) })
