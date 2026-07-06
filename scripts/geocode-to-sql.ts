/**
 * 단지 지오코딩 → SQL 파일 출력
 * 실행: npx tsx scripts/geocode-to-sql.ts
 * 환경변수 필요: KAKAO_REST_API_KEY
 */
const SUPABASE_URL = 'https://auoravdadyzvuoxunogh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1b3JhdmRhZHl6dnVveHVub2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0OTgxMDYsImV4cCI6MjA5MzA3NDEwNn0.gSE-i6Rq15PXNt1IIcrdPHsR9BN4srIJOKRvyN5d-mY'

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY
if (!KAKAO_KEY) {
  console.error('❌ KAKAO_REST_API_KEY 가 설정되지 않음')
  process.exit(1)
}

async function fetchSggLabels(): Promise<Record<string, string>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/regions?select=sgg_code,si,gu&is_active=is.true`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
  )
  if (!res.ok) throw new Error(`regions fetch failed: ${res.statusText}`)
  const rows = await res.json() as Array<{ sgg_code: string; si: string; gu: string | null }>
  return Object.fromEntries(rows.map(r => [r.sgg_code, r.gu ? `${r.si} ${r.gu}` : r.si]))
}

interface Complex {
  id: string
  canonical_name: string
  sgg_code: string
}

async function fetchComplexes(): Promise<Complex[]> {
  let all: Complex[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/complexes?select=id,canonical_name,sgg_code&lat=is.null&order=sgg_code,id&limit=${pageSize}&offset=${offset}`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    )
    if (!res.ok) throw new Error(`Supabase fetch failed: ${res.statusText}`)
    const page = await res.json() as Complex[]
    all = all.concat(page)
    if (page.length < pageSize) break
    offset += pageSize
  }

  return all
}

async function searchKakao(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json')
  url.searchParams.set('query', query)
  url.searchParams.set('size', '1')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) return null

  const json = await res.json() as { documents?: Array<{ y: string; x: string }> }
  const doc = json.documents?.[0]
  if (!doc) return null

  return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) }
}

async function main() {
  const [complexes, SGG_LABEL] = await Promise.all([fetchComplexes(), fetchSggLabels()])
  console.error(`📍 ${complexes.length}개 단지 지오코딩 시작`)

  const rows: string[] = []
  let success = 0, failed = 0

  for (let i = 0; i < complexes.length; i++) {
    const c = complexes[i]!
    const region = SGG_LABEL[c.sgg_code] ?? ''
    const query = `${c.canonical_name} ${region}`

    process.stderr.write(`\r[${i + 1}/${complexes.length}] ${c.canonical_name.substring(0, 20).padEnd(20)} ...`)

    const coord = await searchKakao(query)
    if (coord) {
      rows.push(`('${c.id}', ${coord.lat}, ${coord.lng})`)
      success++
    } else {
      failed++
    }

    await new Promise(r => setTimeout(r, 100))
  }

  process.stderr.write('\n')
  console.error(`✅ 완료: ${success}개 성공, ${failed}개 실패`)

  if (rows.length === 0) {
    console.error('업데이트할 좌표 없음')
    return
  }

  // Output SQL to stdout in batches of 200
  const batchSize = 200
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    console.log(`-- batch ${batchNum}`)
    console.log(`UPDATE complexes SET`)
    console.log(`  lat = v.lat,`)
    console.log(`  lng = v.lng,`)
    console.log(`  geocoding_accuracy = 'kakao_keyword'`)
    console.log(`FROM (VALUES`)
    console.log(batch.join(',\n'))
    console.log(`) AS v(id, lat, lng)`)
    console.log(`WHERE complexes.id = v.id::uuid;`)
    console.log()
  }
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
