/**
 * 네이버 뉴스에서 창원·김해 분양 예정 아파트를 감지하고 presale_discoveries에 저장
 *
 * 실행: npx tsx --env-file=.env.local scripts/crawl-presale-news.ts
 *      npx tsx --env-file=.env.local scripts/crawl-presale-news.ts --dry-run
 *
 * 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, KAKAO_REST_API_KEY
 *          NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 플로우:
 *   1. 뉴스 수집 → 단지명 추출
 *   2. new_listings / complexes 에 이미 존재하면 스킵
 *   3. 카카오 지오코딩 → 주소가 창원시·김해시가 아니면(모르면 포함) 스킵
 *   4. presale_discoveries 에 이미 있으면 스킵 → 없으면 upsert (status: 'pending')
 *   → new_listings 등록은 관리자가 /admin 페이지에서 confirm 시 실행
 *
 * 마지막 줄은 항상 `[runstat] … items=N target=M` 이다. target=0 은 정상일 수 있다(주당 0~1건).
 *
 * 2026-10-14: 건축HUB 매칭 단계 제거. 그 API 는 이름 검색을 지원하지 않아(`bldNm` 단독 → 빈 body)
 * 9주간 매칭 0건이었고, data.go.kr 러너 차단 주엔 단지당 ~58초를 먹어 10-12 타임아웃을 냈다.
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { cleanSecret } from '../src/lib/api/clean-secret'
import {
  buildNewsQueries,
  formatRunstat,
  mentionsTargetCity,
  resolveTargetRegion,
} from '../src/lib/data/presale-news'

loadEnvConfig(process.cwd(), true)

// 시크릿은 반드시 cleanSecret 을 통과시킨다 — 이유는 그 파일 주석 참고(2026-08-10 실장애).
const NAVER_ID  = cleanSecret(process.env.NAVER_CLIENT_ID)
const NAVER_SEC = cleanSecret(process.env.NAVER_CLIENT_SECRET)
const KAKAO_KEY = cleanSecret(process.env.KAKAO_REST_API_KEY)

const DRY_RUN = process.argv.includes('--dry-run')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// 모든 종료 경로가 같은 runstat 을 찍도록 진행 상황을 여기 모은다
const progress = { items: 0, target: 0 }

function fail(message: string): never {
  console.error(message)
  console.log(formatRunstat({ status: 'failed', ...progress }))
  process.exit(1)
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

// ── DB 존재 여부 확인 ─────────────────────────────────────────────
// 조회 에러는 throw 한다 — "없음"으로 읽으면 중복 적재로 이어진다.

async function existsBy(table: string, column: string, value: string, exact: boolean, extra?: [string, string]): Promise<boolean> {
  let query = supabase.from(table).select('id')
  query = exact ? query.eq(column, value) : query.ilike(column, `%${value.replace(/\s+/g, '%')}%`)
  if (extra) query = query.eq(extra[0], extra[1])
  const { data, error } = await query.limit(1)
  if (error) throw new Error(`${table} 조회 실패: ${error.message}`)
  return (data?.length ?? 0) > 0
}

/** new_listings에 이미 등록된 단지인지 확인 */
const existsInNewListings = (name: string) => existsBy('new_listings', 'name', name, false)
/** complexes(canonical_name)에 이미 있는 단지인지 확인 */
const existsInComplexes = (name: string) => existsBy('complexes', 'canonical_name', name, false)
/** presale_discoveries에 이미 있는지 확인 (name+region unique). rejected 행도 막는다 — 의도 */
const existsInDiscoveries = (name: string, region: string) =>
  existsBy('presale_discoveries', 'name', name, true, ['region', region])

// ── 메인 ─────────────────────────────────────────────────────────
async function main() {
  console.log(`== 분양 예정 뉴스 크롤링 시작 ${DRY_RUN ? '[DRY-RUN]' : ''} ==`)
  if (!NAVER_ID || !NAVER_SEC) fail('❌ NAVER_CLIENT_ID/SECRET 없음')
  if (!KAKAO_KEY)               fail('❌ KAKAO_REST_API_KEY 없음')

  const queries = buildNewsQueries()

  // 1. 뉴스 수집
  const allItems: NaverNewsItem[] = []
  let searchFailed = 0
  for (const q of queries) {
    try {
      const items = await searchNews(q, 20)
      allItems.push(...items)
    } catch (err) {
      searchFailed++
      console.warn(`  ⚠ "${q}" 검색 실패: ${String(err)}`)
    }
    await new Promise(r => setTimeout(r, 150)) // Naver 뉴스 API 429 방지
  }

  // 검색이 **전부** 실패하면 실패로 끝낸다.
  //
  // 2026-08-10 이전에는 쿼리가 전부 터져도 warn 만 찍고 exit 0 이라 워크플로가
  // 매일 초록불이었다. 그동안 presale_discoveries 는 0행이었고 아무도 몰랐다.
  // 원인은 시크릿 BOM 이었는데(cleanSecret 주석 참고), 원인이 무엇이든
  // "전부 실패"는 언제나 고장이다 — 이 저장소가 반복해서 당한 부류다(ADR-056/057).
  //
  // 일부 실패는 정상이다(429·일시 오류). 전량 실패만 막는다.
  if (queries.length > 0 && searchFailed === queries.length) {
    fail(
      `\n❌ 검색 쿼리 ${queries.length}건이 전부 실패했습니다 — 시크릿 오염(BOM·공백)이나 ` +
      `API 차단을 의심하세요. 위 경고의 에러 메시지를 확인할 것.`,
    )
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
    if (!mentionsTargetCity(cleanHtml(item.title + ' ' + item.description))) continue
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

  progress.items = aptMap.size
  console.log(`\n감지된 분양 예정 단지: ${aptMap.size}개`)
  for (const [name] of aptMap) {
    console.log(`  - ${name}`)
  }

  // 4. 각 단지 처리
  let skipped = 0
  let outOfTarget = 0
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

    // ── 4-3. 카카오 지오코딩 → 창원·김해만 ─────────────────────────
    const geo = await geocode(name + ' 아파트')
    const region = resolveTargetRegion(geo?.address)
    if (!region) {
      console.log(`  [SKIP] 대상 외: ${name} → ${geo?.address ?? '주소 없음'}`)
      outOfTarget++
      continue
    }
    console.log(`  [GEO] ${name} → ${geo!.address} (${geo!.lat}, ${geo!.lng})`)

    // ── 4-4. presale_discoveries 중복 확인 ───────────────────────
    if (await existsInDiscoveries(name, region)) {
      console.log(`  [SKIP] presale_discoveries 이미 존재: ${name} @ ${region}`)
      skipped++
      continue
    }

    // ── 4-5. presale_discoveries upsert ──────────────────────────
    const row = {
      name,
      region,
      hssply_adres:  geo!.address,
      lat:           geo!.lat,
      lng:           geo!.lng,
      source_url:    meta.link,
      discovered_at: new Date(meta.pubDate).toISOString(),
      status:        'pending' as const,
    }

    if (!DRY_RUN) {
      const { error } = await supabase
        .from('presale_discoveries')
        .upsert(row, { onConflict: 'name,region', ignoreDuplicates: true })
      if (error) {
        errors.push(`${name}: ${error.message}`)
        continue
      }
      console.log(`  [INSERT] presale_discoveries: ${name} @ ${region}`)
    } else {
      console.log(`  [DRY] 저장 예정: ${name} @ ${region}`)
    }
    progress.target++
  }

  console.log('\n== 결과 ==')
  console.log(`  신규 등록: ${progress.target}건 (창원·김해)`)
  console.log(`  대상 외:   ${outOfTarget}건`)
  console.log(`  스킵:      ${skipped}건`)
  if (errors.length > 0) {
    errors.forEach(e => console.error(`  ❌ ${e}`))
    fail(`❌ 적재 실패 ${errors.length}건`)
  }
  console.log('  errors: 0')
  console.log(formatRunstat({ status: 'ok', ...progress }))
}

main().catch(err => fail(`❌ ${err instanceof Error ? err.message : String(err)}`))
