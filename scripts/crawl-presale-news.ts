/**
 * 네이버 뉴스에서 분양 예정 아파트를 감지하고 presale_discoveries에 저장
 *
 * 실행: npx tsx --env-file=.env.local scripts/crawl-presale-news.ts
 *      npx tsx --env-file=.env.local scripts/crawl-presale-news.ts --dry-run
 *
 * 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, KAKAO_REST_API_KEY
 *          MOLIT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 플로우:
 *   1. 뉴스 수집 → 단지명 추출
 *   2. new_listings / complexes 에 이미 존재하면 스킵
 *   3. presale_discoveries 에 이미 있으면 스킵
 *   4. 건축HUB 매칭 시도 (matchArchHub)
 *   5. presale_discoveries 에 upsert (status: 'pending')
 *   → new_listings 등록은 관리자가 /admin 페이지에서 confirm 시 실행
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { matchArchHub } from '../src/services/arch-hub/client'

loadEnvConfig(process.cwd(), true)

const NAVER_ID  = process.env.NAVER_CLIENT_ID
const NAVER_SEC = process.env.NAVER_CLIENT_SECRET
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY

if (!NAVER_ID || !NAVER_SEC) { console.error('❌ NAVER_CLIENT_ID/SECRET 없음'); process.exit(1) }
if (!KAKAO_KEY)               { console.error('❌ KAKAO_REST_API_KEY 없음');      process.exit(1) }

const DRY_RUN = process.argv.includes('--dry-run')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

interface RegionCity { short: string; full: string } // short: '진주' 접미사 제거, full: regions.si 원문('진주시')

/** regions 테이블(is_active=true)에서 시/군 목록을 동적으로 로드. 창원 구 통합 이전 옛 지명(마산/진해)은 뉴스 검색 관행상 유지 */
async function loadRegionCities(): Promise<RegionCity[]> {
  const { data, error } = await supabase.from('regions').select('si').eq('is_active', true)
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  const uniqueSi = [...new Set((data ?? []).map(r => r.si as string))]
  const cities = uniqueSi.map(si => ({ short: si.replace(/(시|군)$/, ''), full: si }))
  if (cities.some(c => c.short === '창원')) {
    cities.push({ short: '마산', full: '창원시 마산' }, { short: '진해', full: '창원시 진해' })
  }
  return cities
}

function buildQueries(cities: RegionCity[]): string[] {
  const queries: string[] = []
  for (const { short } of cities) {
    queries.push(`${short} 아파트 분양 예정`, `${short} 아파트 분양`, `${short} 분양 2026`)
  }
  return queries
}

// ── 아파트명 추출 패턴 ─────────────────────────────────────────────
// 따옴표/꺾쇠 안의 단지명이 가장 신뢰도 높음
const EXTRACT_PATTERNS = [
  /'([가-힣a-zA-Z0-9\s]{4,30}(?:아파트|더휴|캐슬|푸르지오|래미안|자이|힐스테이트|아이파크|e편한세상|롯데캐슬|두산위브|센텀|파크|뷰|시티|메가센텀|포레|하이츠))['\s]?(?:7월|6월|8월|분양|공급|청약)?/,
  /「([가-힣a-zA-Z0-9\s]{4,30}(?:아파트|더휴|캐슬|힐스테이트|아이파크))」/,
  /'([가-힣a-zA-Z0-9\s]{4,30}(?:아파트|더휴|캐슬|힐스테이트|아이파크))'/,
]

// 잡음 패턴 (이 단어가 포함되면 제외)
const NOISE_WORDS = ['거주자', '입주자', '분양권', '모집공고', '수익형', '오피스텔', '지식산업', '브랜드', '소형', '대형', '지방', '수도권', '분양시장']
// 최소 글자 수 미달 또는 일반명사로만 구성된 이름 제외
const GENERIC_NAMES = /^(아파트|분양|주택|단지|브랜드\s*아파트|소형\s*아파트|대단지\s*아파트|지방.+아파트)$/

function cleanHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

function extractAptNames(title: string, desc: string): string[] {
  const text = cleanHtml(title + ' ' + desc)
  const names: string[] = []

  for (const pattern of EXTRACT_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, 'g'))
    for (const m of matches) {
      const name = m[1]?.trim().replace(/\s+/g, ' ')
      if (
        name &&
        name.length >= 4 &&
        !NOISE_WORDS.some(w => name.includes(w)) &&
        !GENERIC_NAMES.test(name)
      ) {
        names.push(name)
      }
    }
  }
  return [...new Set(names)]
}

function isTargetCity(title: string, desc: string, cities: RegionCity[]): boolean {
  const text = cleanHtml(title + ' ' + desc)
  return cities.some(c => text.includes(c.short))
}

// ── 네이버 뉴스 검색 ──────────────────────────────────────────────
interface NaverNewsItem {
  title: string
  description: string
  pubDate: string
  link: string
  originallink: string
}

async function searchNews(query: string, display = 20): Promise<NaverNewsItem[]> {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`
  const res = await fetch(url, {
    headers: { 'X-Naver-Client-Id': NAVER_ID!, 'X-Naver-Client-Secret': NAVER_SEC! },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Naver news API ${res.status}`)
  const json = await res.json() as { items?: NaverNewsItem[] }
  return json.items ?? []
}

// ── 카카오 지오코딩 ───────────────────────────────────────────────
async function geocode(query: string): Promise<{ lat: number; lng: number; address: string } | null> {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) return null
  const json = await res.json() as { documents?: Array<{ x: string; y: string; address_name: string; place_name: string }> }
  const doc = json.documents?.[0]
  if (!doc) return null
  return { lat: parseFloat(doc.y), lng: parseFloat(doc.x), address: doc.address_name }
}

// ── 지역명 추출 ────────────────────────────────────────────────────
function extractRegion(address: string | undefined, aptName: string, cities: RegionCity[]): string {
  // 마산/진해처럼 short가 짧고 겹칠 수 있는 지명을 먼저 매칭하도록 길이 내림차순 정렬
  const sorted = [...cities].sort((a, b) => b.short.length - a.short.length)
  if (address) {
    const hit = sorted.find(c => address.includes(c.short))
    if (hit) return hit.full
  }
  // 주소 없을 경우 단지명에서 지역 추출
  const hit = sorted.find(c => aptName.includes(c.short))
  return hit ? hit.full : '경남'
}

// ── DB 존재 여부 확인 ─────────────────────────────────────────────

/** new_listings에 이미 등록된 단지인지 확인 */
async function existsInNewListings(name: string): Promise<boolean> {
  const pattern = `%${name.replace(/\s+/g, '%')}%`
  const { data } = await supabase
    .from('new_listings')
    .select('id')
    .ilike('name', pattern)
    .limit(1)
  return (data?.length ?? 0) > 0
}

/** complexes(canonical_name)에 이미 있는 단지인지 확인 */
async function existsInComplexes(name: string): Promise<boolean> {
  const pattern = `%${name.replace(/\s+/g, '%')}%`
  const { data } = await supabase
    .from('complexes')
    .select('id')
    .ilike('canonical_name', pattern)
    .limit(1)
  return (data?.length ?? 0) > 0
}

/** presale_discoveries에 이미 있는지 확인 (name+region unique) */
async function existsInDiscoveries(name: string, region: string): Promise<boolean> {
  const { data } = await supabase
    .from('presale_discoveries')
    .select('id')
    .eq('name', name)
    .eq('region', region)
    .limit(1)
  return (data?.length ?? 0) > 0
}

// ── 메인 ─────────────────────────────────────────────────────────
async function main() {
  console.log(`== 분양 예정 뉴스 크롤링 시작 ${DRY_RUN ? '[DRY-RUN]' : ''} ==`)

  const cities = await loadRegionCities()
  const queries = buildQueries(cities)
  console.log(`대상 지역(regions is_active=true + 창원 구지명): ${cities.map(c => c.short).join(', ')}`)

  // 1. 뉴스 수집
  const allItems: NaverNewsItem[] = []
  for (const q of queries) {
    try {
      const items = await searchNews(q, 20)
      allItems.push(...items)
    } catch (err) {
      console.warn(`  ⚠ "${q}" 검색 실패: ${String(err)}`)
    }
    await new Promise(r => setTimeout(r, 150)) // 지역 확대(6→60개 쿼리)로 Naver 뉴스 API 429 방지
  }

  // 2. 중복 제거 (link 기준)
  const seen = new Set<string>()
  const uniqueItems = allItems.filter(i => {
    const key = i.link || i.originallink
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  console.log(`뉴스 수집: ${uniqueItems.length}건 (중복 제거 후)`)

  // 3. 아파트명 추출
  const aptMap = new Map<string, { pubDate: string; link: string }>()
  for (const item of uniqueItems) {
    if (!isTargetCity(item.title, item.description, cities)) continue
    const names = extractAptNames(item.title, item.description)
    for (const name of names) {
      if (!aptMap.has(name) || new Date(item.pubDate) > new Date(aptMap.get(name)!.pubDate)) {
        aptMap.set(name, { pubDate: item.pubDate, link: item.link })
      }
    }
  }

  // 짧은 이름이 긴 이름의 부분집합이면 제거 (예: "창원 한신더휴" ⊂ "창원 한신더휴 메가센텀")
  const aptNames = [...aptMap.keys()]
  for (const name of aptNames) {
    const isSubset = aptNames.some(other => other !== name && other.includes(name))
    if (isSubset) aptMap.delete(name)
  }

  console.log(`\n감지된 분양 예정 단지: ${aptMap.size}개`)
  for (const [name] of aptMap) {
    console.log(`  - ${name}`)
  }

  if (aptMap.size === 0) {
    console.log('감지된 단지 없음.')
    return
  }

  // 4. 각 단지 처리
  let inserted = 0
  let skipped = 0
  const errors: string[] = []

  for (const [name, meta] of aptMap) {
    // ── 4-1. new_listings 존재 확인 ──────────────────────────────
    if (await existsInNewListings(name)) {
      console.log(`  [SKIP] new_listings 이미 존재: ${name}`)
      skipped++
      continue
    }

    // ── 4-2. complexes 존재 확인 ─────────────────────────────────
    if (await existsInComplexes(name)) {
      console.log(`  [SKIP] complexes 이미 존재: ${name}`)
      skipped++
      continue
    }

    // ── 4-3. 카카오 지오코딩 ──────────────────────────────────────
    const geo = await geocode(name + ' 아파트')
    console.log(`  [GEO] ${name} → ${geo ? `${geo.address} (${geo.lat}, ${geo.lng})` : '위치 없음'}`)

    const region = extractRegion(geo?.address, name, cities)

    // ── 4-4. presale_discoveries 중복 확인 ───────────────────────
    if (await existsInDiscoveries(name, region)) {
      console.log(`  [SKIP] presale_discoveries 이미 존재: ${name} @ ${region}`)
      skipped++
      continue
    }

    // ── 4-5. 건축HUB 매칭 ────────────────────────────────────────
    let archHubId: string | null = null
    let archHubData: Record<string, unknown> | null = null
    let archHubMatchedAt: string | null = null

    try {
      const archMatch = await matchArchHub(name)
      if (archMatch) {
        archHubId = archMatch.mgmPmsrgstPk ?? null
        archHubData = archMatch as unknown as Record<string, unknown>
        archHubMatchedAt = new Date().toISOString()
        console.log(`  [ARCH] ${name} → ${archMatch.bldNm ?? '?'} (${archMatch.hhldCnt ?? '?'}세대)`)
      } else {
        console.log(`  [ARCH] ${name} → 매칭 없음 (admin 수동 입력 필요)`)
      }
    } catch (err) {
      console.warn(`  [ARCH] ${name} 건축HUB 조회 실패: ${String(err)}`)
    }

    // ── 4-6. presale_discoveries upsert ──────────────────────────
    const row = {
      name,
      region,
      hssply_adres:        geo?.address ?? null,
      lat:                 geo?.lat ?? null,
      lng:                 geo?.lng ?? null,
      source_url:          meta.link,
      discovered_at:       new Date(meta.pubDate).toISOString(),
      arch_hub_id:         archHubId,
      arch_hub_data:       archHubData,
      arch_hub_matched_at: archHubMatchedAt,
      status:              'pending' as const,
    }

    if (!DRY_RUN) {
      const { error } = await supabase
        .from('presale_discoveries')
        .upsert(row, { onConflict: 'name,region', ignoreDuplicates: true })
      if (error) {
        errors.push(`${name}: ${error.message}`)
      } else {
        console.log(`  [INSERT] presale_discoveries: ${name} @ ${region}`)
        inserted++
      }
    } else {
      console.log(`  [DRY] 저장 예정: ${name} @ ${region}${archHubId ? ` (arch_hub: ${archHubId})` : ''}`)
      inserted++
    }
  }

  console.log('\n== 결과 ==')
  console.log(`  신규 등록: ${inserted}건`)
  console.log(`  스킵:      ${skipped}건`)
  if (errors.length > 0) errors.forEach(e => console.error(`  ❌ ${e}`))
  else console.log('  errors: 0')
}

main().catch(console.error)
