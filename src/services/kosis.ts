import 'server-only'

export const KOSIS_BASE = 'https://kosis.kr/openapi/Param/statisticsParameterData.do'

// 행정구역(시군구)별, 성별 인구수
const ORG_ID = '101'
const TBL_ID = 'DT_1B040A3'
const ITM_ID = 'T20' // 총인구수

export interface KosisPopulationRow {
  sggCode:    string // 5자리 시군구 코드 (예: '48121')
  sggName:    string // 시군구명 (예: '의창구')
  year:       number // 연도
  population: number // 총인구수 (명)
}

// Supabase region_population_cache 읽기 (anon key, 공개 읽기)
async function readCachedPopulation(sggCodes: string[]): Promise<KosisPopulationRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return []

  const filter = sggCodes.join(',')
  const apiUrl = `${supabaseUrl}/rest/v1/region_population_cache?sgg_code=in.(${filter})&order=sgg_code,year`

  try {
    const res = await fetch(apiUrl, {
      headers: {
        apikey:        anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      cache:  'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return []
    return (data as Record<string, unknown>[]).map(r => ({
      sggCode:    r.sgg_code    as string,
      sggName:    r.sgg_name    as string,
      year:       r.year        as number,
      population: r.population  as number,
    }))
  } catch {
    return []
  }
}

// Supabase region_population_cache 쓰기 (service role key, fire-and-forget)
async function writeCachedPopulation(rows: KosisPopulationRow[]): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey || rows.length === 0) return

  try {
    await fetch(`${supabaseUrl}/rest/v1/region_population_cache`, {
      method:  'POST',
      headers: {
        apikey:          serviceKey,
        Authorization:   `Bearer ${serviceKey}`,
        'Content-Type':  'application/json',
        Prefer:          'resolution=merge-duplicates',
      },
      body: JSON.stringify(
        rows.map(r => ({
          sgg_code:   r.sggCode,
          year:       r.year,
          sgg_name:   r.sggName,
          population: r.population,
          fetched_at: new Date().toISOString(),
        }))
      ),
    })
  } catch {
    // fire-and-forget: 실패해도 KOSIS 원본 데이터는 이미 반환됨
  }
}

/**
 * 시군구별 연도별 인구수 조회.
 * 1. Supabase region_population_cache 캐시 우선 (< 100ms)
 * 2. 캐시 없으면 KOSIS API 호출 후 캐시 저장 (fire-and-forget)
 */
export async function fetchPopulationBySgg(
  sggCodes: string[],
  years = 10,
): Promise<KosisPopulationRow[]> {
  if (sggCodes.length === 0) return []

  // 1. Supabase 캐시
  const cached = await readCachedPopulation(sggCodes)
  if (cached.length > 0) return cached

  // 2. KOSIS API 폴백
  const key = process.env.KOSIS_API_KEY
  if (!key) return []

  const objL1 = sggCodes.join('+') + '+'
  const url =
    `${KOSIS_BASE}?method=getList` +
    `&apiKey=${encodeURIComponent(key)}` +
    `&orgId=${ORG_ID}&tblId=${TBL_ID}` +
    `&itmId=${ITM_ID}+` +
    `&objL1=${objL1}` +
    `&objL2=&objL3=&objL4=&objL5=&objL6=&objL7=&objL8=` +
    `&format=json&jsonVD=Y` +
    `&prdSe=Y&newEstPrdCnt=${years}`

  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return []
    const json = await res.json()
    if (!Array.isArray(json)) return []

    const rows = (json as Record<string, string>[])
      .filter(r => r['ITM_ID'] === 'T20' && r['DT'] && r['C1'] && r['C1_NM'])
      .map(r => ({
        sggCode:    r['C1']!,
        sggName:    r['C1_NM']!,
        year:       Number(r['PRD_DE']),
        population: Number(r['DT']),
      }))
      .filter(r => !isNaN(r.year) && !isNaN(r.population))
      .sort((a, b) => a.sggCode.localeCompare(b.sggCode) || a.year - b.year)

    // 3. 캐시 저장 (비동기, 결과에 영향 없음)
    writeCachedPopulation(rows).catch(() => {})

    return rows
  } catch {
    return []
  }
}
