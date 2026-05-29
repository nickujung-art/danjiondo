/**
 * 네이버 뉴스에서 분양 예정 아파트를 감지하고 new_listings에 저장
 *
 * 실행: npx tsx --env-file=.env.local scripts/crawl-presale-news.ts
 *      npx tsx --env-file=.env.local scripts/crawl-presale-news.ts --dry-run
 *
 * 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, KAKAO_REST_API_KEY
 *          NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

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

// ── 검색 쿼리 ─────────────────────────────────────────────────────
const QUERIES = [
  '창원 아파트 분양 예정',
  '창원 아파트 분양',
  '김해 아파트 분양 예정',
  '김해 아파트 분양',
  '창원 분양 2026',
  '김해 분양 2026',
]

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
const TARGET_CITIES = ['창원', '마산', '진해', '김해']

function cleanHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

function extractAptNames(title: string, desc: string): string[] {
  const text = cleanHtml(title + ' ' + desc)
  const names: string[] = []

  for (const pattern of EXTRACT_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, 'g'))
    for (const m of matches) {
      const name = m[1].trim().replace(/\s+/g, ' ')
      if (
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

function isTargetCity(title: string, desc: string): boolean {
  const text = cleanHtml(title + ' ' + desc)
  return TARGET_CITIES.some(c => text.includes(c))
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

// ── 메인 ─────────────────────────────────────────────────────────
async function main() {
  console.log(`== 분양 예정 뉴스 크롤링 시작 ${DRY_RUN ? '[DRY-RUN]' : ''} ==`)

  // 1. 뉴스 수집
  const allItems: NaverNewsItem[] = []
  for (const q of QUERIES) {
    try {
      const items = await searchNews(q, 20)
      allItems.push(...items)
    } catch (err) {
      console.warn(`  ⚠ "${q}" 검색 실패: ${String(err)}`)
    }
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
    if (!isTargetCity(item.title, item.description)) continue
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

  // 4. DB에 없는 단지만 처리
  let upserted = 0
  const errors: string[] = []

  for (const [name, meta] of aptMap) {
    // 이미 new_listings에 있는지 확인 (이름 유사 매칭)
    const { data: existing } = await supabase
      .from('new_listings')
      .select('id')
      .ilike('name', `%${name.replace(/\s+/g, '%')}%`)
      .limit(1)

    if (existing && existing.length > 0) {
      console.log(`  [SKIP] 이미 존재: ${name}`)
      continue
    }

    // 카카오로 위치 조회
    const geo = await geocode(name + ' 아파트')
    console.log(`  [GEO] ${name} → ${geo ? `${geo.address} (${geo.lat}, ${geo.lng})` : '위치 없음'}`)

    // 지역명 추출 (창원/김해 여부)
    const region = geo?.address?.includes('김해') ? '김해시' :
                   geo?.address?.includes('마산') ? '창원시 마산' :
                   geo?.address?.includes('창원') ? '창원시' : '경남'

    // new_listings에 저장
    const row = {
      name,
      region,
      pblanc_no:    null,               // 공고번호 없음 (청약 전)
      pblanc_nm:    name,
      sgg_code:     null,
      supply_region: region,
      supply_count:  null,
      rcept_bgnde:   null,
      rcept_endde:   null,
      przwner_presnatn_de: null,
      mvn_prearnge_ym: null,
      hssply_adres:  geo?.address ?? null,
      is_active:     true,
      fetched_at:    new Date().toISOString(),
      price_min:     null,
      price_max:     null,
      source_code:   'news_crawl',
      lat:           geo?.lat ?? null,
      lng:           geo?.lng ?? null,
    }

    if (!DRY_RUN) {
      // news_crawl 항목은 pblanc_no가 null이므로 name+region으로 중복 확인 후 insert
      const { data: dup } = await supabase
        .from('new_listings')
        .select('id')
        .eq('name', name)
        .eq('source_code', 'news_crawl')
        .limit(1)
      if (dup && dup.length > 0) {
        console.log(`  [SKIP] 이미 존재 (news_crawl): ${name}`)
        continue
      }
      const { error } = await supabase.from('new_listings').insert(row)
      if (error) errors.push(`${name}: ${error.message}`)
      else upserted++
    } else {
      console.log(`  [DRY] 저장 예정: ${name} @ ${region}`)
      upserted++
    }
  }

  console.log('\n== 결과 ==')
  console.log(`  신규 등록: ${upserted}건`)
  if (errors.length > 0) errors.forEach(e => console.log(`  ❌ ${e}`))
  else console.log('  errors: 0')
}

main().catch(console.error)
