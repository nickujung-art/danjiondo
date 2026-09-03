// 🔴 이 파일에는 import/export 가 없어 **모듈이 아니라 전역 스크립트**로 취급된다.
//    그러면 top-level 선언이 전역에 올라가 다른 스크립트의 같은 이름(main 등)과 충돌한다
//    (TS2393 Duplicate function implementation). 빈 export 로 모듈로 만든다.
export {}

/**
 * 단지 지오코딩 → SQL 파일 출력
 * 실행: npx tsx scripts/geocode-to-sql.ts
 * 환경변수 필요: KAKAO_REST_API_KEY
 */
/*
  URL·키를 하드코딩하지 않는다(2026-08-18).

  이전엔 프로젝트 URL 과 anon 키가 이 파일에 박혀 있었다. 2026-08-18 에 Supabase 를
  시드니에서 서울로 옮겼는데(ADR/RUNBOOK 참고) 이 스크립트만 옛 프로젝트를 가리킨 채
  남았다 — 실행했다면 **폐기된 DB 를 읽고 그 결과로 SQL 을 만들어냈을 것**이고
  아무 에러도 안 났을 것이다. 환경변수로 읽으면 프로젝트가 바뀌어도 따라간다.
*/
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY
if (!KAKAO_KEY) {
  console.error('❌ KAKAO_REST_API_KEY 가 설정되지 않음')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 설정되지 않음')
  process.exit(1)
}

async function fetchSggLabels(): Promise<Record<string, string>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/regions?select=sgg_code,si,gu&is_active=is.true`,
    { headers: { apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
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
      { headers: { apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
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
