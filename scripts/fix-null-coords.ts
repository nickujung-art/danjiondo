/**
 * lat=NULL 단지 좌표 자동 보완
 *
 * 트랜잭션의 umd_nm으로 읍면동 중심 좌표를 구한 뒤,
 * 반경 3km 내에서 단지명(점진적 축약) 키워드 검색으로 좌표를 확정한다.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/fix-null-coords.ts
 *   npx tsx --env-file=.env.local scripts/fix-null-coords.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/fix-null-coords.ts --sgg=48250
 *
 * 환경변수: KAKAO_REST_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd(), true)

if (!process.env.KAKAO_REST_API_KEY)         { console.error('❌ KAKAO_REST_API_KEY 없음');          process.exit(1) }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL)   { console.error('❌ NEXT_PUBLIC_SUPABASE_URL 없음');    process.exit(1) }
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)  { console.error('❌ SUPABASE_SERVICE_ROLE_KEY 없음');   process.exit(1) }

const DRY_RUN = process.argv.includes('--dry-run')
const sggArg  = process.argv.find(a => a.startsWith('--sgg='))?.split('=')[1]

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const BBOX = { minLat: 34.8, maxLat: 35.7, minLng: 128.2, maxLng: 129.1 }

const SGG_LABEL: Record<string, string> = {
  '48121': '창원시 의창구',
  '48123': '창원시 성산구',
  '48125': '창원시 마산합포구',
  '48127': '창원시 마산회원구',
  '48129': '창원시 진해구',
  '48250': '김해시',
}

function isInRegion(addressName: string, sggCode: string): boolean {
  const a = addressName
  switch (sggCode) {
    case '48121': return a.includes('창원') && a.includes('의창')
    case '48123': return a.includes('창원') && a.includes('성산')
    case '48125': return a.includes('창원') && (a.includes('합포') || a.includes('마산합포'))
    case '48127': return a.includes('창원') && (a.includes('회원') || a.includes('마산회원'))
    case '48129': return a.includes('창원') && a.includes('진해')
    case '48250': return a.includes('김해')
    default: return false
  }
}

interface KakaoDoc { place_name: string; address_name: string; x: string; y: string }

const HEADERS = { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY!}` }

async function geocodeDong(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json')
  url.searchParams.set('query', address)
  url.searchParams.set('size', '1')
  const res = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(5_000) })
  if (!res.ok) return null
  const json = (await res.json()) as { documents?: { x: string; y: string }[] }
  const d = json.documents?.[0]
  return d ? { lat: parseFloat(d.y), lng: parseFloat(d.x) } : null
}

async function kwNear(name: string, cx: number, cy: number, sggCode: string): Promise<KakaoDoc | null> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json')
  url.searchParams.set('query', name)
  url.searchParams.set('x', String(cx))
  url.searchParams.set('y', String(cy))
  url.searchParams.set('radius', '3000')
  url.searchParams.set('sort', 'distance')
  url.searchParams.set('size', '5')
  const res = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(5_000) })
  if (!res.ok) return null
  const json = (await res.json()) as { documents?: KakaoDoc[] }
  for (const doc of json.documents ?? []) {
    const lat = parseFloat(doc.y), lng = parseFloat(doc.x)
    const inBbox = lat >= BBOX.minLat && lat <= BBOX.maxLat && lng >= BBOX.minLng && lng <= BBOX.maxLng
    if (inBbox && isInRegion(doc.address_name, sggCode)) return doc
  }
  return null
}

async function kakaoKeyword(query: string, sggCode: string): Promise<KakaoDoc | null> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json')
  url.searchParams.set('query', query)
  url.searchParams.set('size', '5')
  const res = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(5_000) })
  if (!res.ok) return null
  const json = (await res.json()) as { documents?: KakaoDoc[] }
  for (const doc of json.documents ?? []) {
    const lat = parseFloat(doc.y), lng = parseFloat(doc.x)
    const inBbox = lat >= BBOX.minLat && lat <= BBOX.maxLat && lng >= BBOX.minLng && lng <= BBOX.maxLng
    if (inBbox && isInRegion(doc.address_name, sggCode)) return doc
  }
  return null
}

// 이름이 길수록 카카오 POI에 등록 안 된 경우가 많음 — 점진적으로 축약
function nameVariants(name: string): string[] {
  const variants = new Set<string>()
  variants.add(name)
  // 앞 7, 5자 축약 (단지 번호+단지명 핵심 포착)
  if (name.length > 7)  variants.add(name.slice(0, 7))
  if (name.length > 5)  variants.add(name.slice(0, 5))
  // 공백 기준 앞 단어
  const firstWord = name.split(/\s/)[0]
  if (firstWord && firstWord.length < name.length) variants.add(firstWord)
  return [...variants]
}

async function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

async function main() {
  console.log(`📍 lat=NULL 단지 좌표 보완 시작${DRY_RUN ? ' [DRY-RUN]' : ''}`)

  let baseQuery = supabase
    .from('complexes')
    .select('id, canonical_name, sgg_code')
    .eq('status', 'active')
    .is('lat', null)

  if (sggArg) baseQuery = baseQuery.eq('sgg_code', sggArg)

  const { data: complexes, error } = await baseQuery
  if (error) throw new Error(`조회 실패: ${error.message}`)
  const rows = (complexes ?? []) as Array<{ id: string; canonical_name: string; sgg_code: string }>

  // 단지별 최빈 umd_nm 집계 (50개씩 배치로 1,000행 캡 우회)
  const umdMap = new Map<string, string>()
  for (const batch of chunk(rows.map(r => r.id), 50)) {
    const { data: umdRows } = await supabase
      .from('transactions')
      .select('complex_id, umd_nm')
      .in('complex_id', batch)
      .not('umd_nm', 'is', null)
      .is('cancel_date', null)
      .is('superseded_by', null)
      .limit(500)
    const cnt = new Map<string, Map<string, number>>()
    for (const r of (umdRows ?? []) as Array<{ complex_id: string; umd_nm: string }>) {
      if (!cnt.has(r.complex_id)) cnt.set(r.complex_id, new Map())
      const m = cnt.get(r.complex_id)!
      m.set(r.umd_nm, (m.get(r.umd_nm) ?? 0) + 1)
    }
    for (const [cid, m] of cnt) {
      const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
      if (top) umdMap.set(cid, top[0])
    }
  }

  console.log(`📋 대상: ${rows.length}개 단지 (umd_nm 보유: ${umdMap.size}개)\n`)

  let fixed = 0, notFound = 0

  // 읍면동 중심 좌표 캐시
  const dongCache = new Map<string, { lat: number; lng: number } | null>()

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i]!
    const region  = SGG_LABEL[c.sgg_code] ?? c.sgg_code
    const umdNm   = umdMap.get(c.id) ?? null

    process.stdout.write(`\r[${i + 1}/${rows.length}] ${c.canonical_name} ...`)

    let place: KakaoDoc | null = null

    if (umdNm) {
      // 읍면동 중심 좌표 (캐시 활용)
      const dongKey = `${c.sgg_code}|${umdNm}`
      if (!dongCache.has(dongKey)) {
        const center = await geocodeDong(`경남 ${region} ${umdNm}`)
        dongCache.set(dongKey, center)
        await delay(80)
      }
      const center = dongCache.get(dongKey) ?? null

      if (center) {
        // 이름 축약 변형들을 순서대로 시도
        for (const variant of nameVariants(c.canonical_name)) {
          place = await kwNear(variant, center.lng, center.lat, c.sgg_code)
          await delay(80)
          if (place) break
        }
      }

      // 반경 검색 실패 → 일반 키워드: "단지명(축약) + 시군구 + 읍면동"
      if (!place) {
        for (const variant of nameVariants(c.canonical_name)) {
          place = await kakaoKeyword(`${variant} ${region} ${umdNm}`, c.sgg_code)
          await delay(80)
          if (place) break
        }
      }
    }

    // umd_nm 없거나 여전히 미발견 → "단지명(축약) + 시군구"
    if (!place) {
      for (const variant of nameVariants(c.canonical_name)) {
        place = await kakaoKeyword(`${variant} ${region}`, c.sgg_code)
        await delay(80)
        if (place) break
      }
    }

    if (!place) {
      notFound++
    } else {
      const newLat = parseFloat(place.y)
      const newLng = parseFloat(place.x)
      const umdTag = umdNm ? ` [${umdNm}]` : ''
      console.log(`\n  ✅ [${i + 1}] ${c.canonical_name}${umdTag} → (${newLat.toFixed(4)}, ${newLng.toFixed(4)})  [${place.address_name}]`)
      if (!DRY_RUN) {
        const { error: uErr } = await supabase
          .from('complexes').update({ lat: newLat, lng: newLng }).eq('id', c.id)
        if (uErr) console.error(`    ❌ 업데이트 실패: ${uErr.message}`)
      }
      fixed++
    }
  }

  console.log(`\n\n✅ 완료: ${fixed}개 수정, ${notFound}개 수동 처리 필요`)
  if (notFound > 0) console.log('💡 수동 처리 단지는 카카오맵에서 주소 확인 후 DB 직접 업데이트')
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
