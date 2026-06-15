/**
 * KOSIS 인구 데이터 → Supabase region_population_cache 초기 적재 스크립트
 *
 * 실행: npx dotenv-cli -e .env.local npx tsx scripts/seed-kosis-population.ts
 * 연간 1회 재실행 권장 (매년 새 통계 발표 후)
 */

const KOSIS_BASE = 'https://kosis.kr/openapi/Param/statisticsParameterData.do'
const ORG_ID     = '101'
const TBL_ID     = 'DT_1B040A3'
const ITM_ID     = 'T20'

const SGG_CODES = ['48121', '48123', '48125', '48127', '48129', '48250']

interface Row {
  sgg_code:   string
  year:       number
  sgg_name:   string
  population: number
  fetched_at: string
}

async function fetchFromKosis(): Promise<Row[]> {
  const key = process.env.KOSIS_API_KEY
  if (!key) throw new Error('KOSIS_API_KEY not set')

  const objL1 = SGG_CODES.join('+') + '+'
  const url =
    `${KOSIS_BASE}?method=getList` +
    `&apiKey=${encodeURIComponent(key)}` +
    `&orgId=${ORG_ID}&tblId=${TBL_ID}` +
    `&itmId=${ITM_ID}+` +
    `&objL1=${objL1}` +
    `&objL2=&objL3=&objL4=&objL5=&objL6=&objL7=&objL8=` +
    `&format=json&jsonVD=Y` +
    `&prdSe=Y&newEstPrdCnt=10`

  console.log('KOSIS API 호출 중...')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`KOSIS API ${res.status}: ${await res.text()}`)

  const json = await res.json()
  if (!Array.isArray(json)) {
    console.error('응답:', JSON.stringify(json).slice(0, 300))
    throw new Error('KOSIS 응답이 배열이 아님')
  }

  const now = new Date().toISOString()
  return (json as Record<string, string>[])
    .filter(r => r['ITM_ID'] === 'T20' && r['DT'] && r['C1'] && r['C1_NM'])
    .map(r => ({
      sgg_code:   r['C1']!,
      year:       Number(r['PRD_DE']),
      sgg_name:   r['C1_NM']!,
      population: Number(r['DT']),
      fetched_at: now,
    }))
    .filter(r => !isNaN(r.year) && !isNaN(r.population))
    .sort((a, b) => a.sgg_code.localeCompare(b.sgg_code) || a.year - b.year)
}

async function upsertToSupabase(rows: Row[]): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set')
  if (!serviceKey)  throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

  const res = await fetch(`${supabaseUrl}/rest/v1/region_population_cache`, {
    method:  'POST',
    headers: {
      apikey:          serviceKey,
      Authorization:   `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
      Prefer:          'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase upsert ${res.status}: ${text}`)
  }
}

async function main() {
  const rows = await fetchFromKosis()
  console.log(`KOSIS에서 ${rows.length}건 수신`)
  rows.forEach(r => console.log(`  ${r.sgg_code} ${r.sgg_name} ${r.year}: ${r.population.toLocaleString('ko-KR')}명`))

  await upsertToSupabase(rows)
  console.log(`✓ Supabase region_population_cache에 ${rows.length}건 저장 완료`)
}

main().catch(err => {
  console.error('실패:', err)
  process.exit(1)
})
