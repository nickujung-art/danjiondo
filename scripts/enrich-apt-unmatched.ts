/**
 * K-apt 미매칭 아파트 단지 기본정보 보강 스크립트
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/enrich-apt-unmatched.ts
 *   npx tsx --env-file=.env.local scripts/enrich-apt-unmatched.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/enrich-apt-unmatched.ts --id=<uuid>
 *   npx tsx --env-file=.env.local scripts/enrich-apt-unmatched.ts --skip-bldrgst
 *   npx tsx --env-file=.env.local scripts/enrich-apt-unmatched.ts --bldrgst-only
 *     → 좌표 있는 단지(lat IS NOT NULL, floors_above IS NULL)에 건축물대장만 적용
 *   npx tsx --env-file=.env.local scripts/enrich-apt-unmatched.ts --household-zero
 *     → household_count=0 또는 NULL이고 좌표 있는 단지에 건축물대장으로 세대수 보강
 *     → 좌표 범위 필터(창원/김해 bbox) 자동 적용으로 오좌표 단지 제외
 *
 * 필요 환경변수: MOLIT_API_KEY, KAKAO_REST_API_KEY,
 *               NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 처리 흐름 (단지당):
 *   1. 카카오 키워드 검색 → lat/lng + 도로명주소  (--bldrgst-only 시 생략)
 *   2. coord2regioncode + coord2address → dong명 + b_code + 지번
 *   3. complexes 업데이트 (lat/lng, si/gu/dong, road_address, jibun_address)
 *   4. 건축물대장 표제부 → household_count, floors_above/below, built_year
 *      (--skip-bldrgst 플래그로 생략 가능)
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { fetchBldTitleInfo } from '../src/services/bld-rgst'

loadEnvConfig(process.cwd(), true)

const args           = process.argv.slice(2)
const DRY_RUN        = args.includes('--dry-run')
const SKIP_BLD       = args.includes('--skip-bldrgst')
const BLDRGST_ONLY   = args.includes('--bldrgst-only')   // 좌표 있는 단지에 건축물대장만
const RETRY_MODE     = args.includes('--retry')           // 좌표 없는 단지 재시도: 거래 umd_nm(동명) 활용
const HOUSEHOLD_ZERO = args.includes('--household-zero')  // household_count=0|null 단지에 건축물대장으로 세대수 보강
const TARGET_ID      = args.find(a => a.startsWith('--id='))?.split('=')[1]

// 창원/김해 bbox (오좌표 단지 제외용)
const BBOX = { minLat: 34.8, maxLat: 35.7, minLng: 128.2, maxLng: 129.1 }

if (!process.env.KAKAO_REST_API_KEY)          { console.error('❌ KAKAO_REST_API_KEY 없음');           process.exit(1) }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL)    { console.error('❌ NEXT_PUBLIC_SUPABASE_URL 없음');     process.exit(1) }
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)   { console.error('❌ SUPABASE_SERVICE_ROLE_KEY 없음');    process.exit(1) }
if (!SKIP_BLD && !process.env.MOLIT_API_KEY)  { console.error('❌ MOLIT_API_KEY 없음 (--skip-bldrgst로 생략 가능)'); process.exit(1) }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// ── sgg_code → si/gu 매핑 (regions 테이블 기반 동적 조회) ──────────
async function getSggMap(): Promise<Record<string, { si: string; gu: string | null }>> {
  const { data, error } = await supabase
    .from('regions')
    .select('sgg_code, si, gu')
    .eq('is_active', true)
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  const map: Record<string, { si: string; gu: string | null }> = {}
  for (const r of (data ?? []) as { sgg_code: string; si: string; gu: string | null }[]) {
    map[r.sgg_code] = { si: r.si, gu: r.gu }
  }
  return map
}

function buildSggLabel(sggMap: Record<string, { si: string; gu: string | null }>): Record<string, string> {
  const label: Record<string, string> = {}
  for (const [code, { si, gu }] of Object.entries(sggMap)) {
    label[code] = gu ? `${si} ${gu}` : si
  }
  return label
}

// ── 카카오 키워드 검색 ────────────────────────────────────────────
interface KakaoPlace {
  place_name:        string
  address_name:      string
  road_address_name: string
  x: string
  y: string
}

async function kakaoKeywordSearch(query: string): Promise<KakaoPlace | null> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json')
  url.searchParams.set('query', query)
  url.searchParams.set('size', '1')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY!}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) return null
  const json = await res.json() as { documents?: KakaoPlace[] }
  return json.documents?.[0] ?? null
}

// ── 좌표 → dong명 + b_code + 지번 ────────────────────────────────
interface KakaoAddrFromCoord {
  b_code:          string
  dong:            string   // 법정동명 (ex: '봉곡동')
  main_address_no: string
  sub_address_no:  string
}

async function kakaoCoordToAddr(lat: number, lng: number): Promise<KakaoAddrFromCoord | null> {
  const headers = { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY!}` }
  const signal  = AbortSignal.timeout(5_000)

  const [regionRes, addrRes] = await Promise.all([
    fetch(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`, { headers, signal }),
    fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`, { headers, signal }),
  ])
  if (!regionRes.ok || !addrRes.ok) return null

  const regionJson = await regionRes.json() as {
    documents?: Array<{ region_type: string; code: string; region_3depth_name: string }>
  }
  const addrJson = await addrRes.json() as {
    documents?: Array<{
      address?: { main_address_no?: string; sub_address_no?: string }
    }>
  }

  const bDoc = regionJson.documents?.find(d => d.region_type === 'B')
  if (!bDoc?.code) return null

  const addr = addrJson.documents?.[0]?.address
  if (!addr?.main_address_no) return null

  return {
    b_code:          bDoc.code,
    dong:            bDoc.region_3depth_name,
    main_address_no: addr.main_address_no,
    sub_address_no:  addr.sub_address_no ?? '',
  }
}

// ── 건축물대장 파라미터 파싱 ──────────────────────────────────────
function parseBldParams(r: KakaoAddrFromCoord) {
  return {
    sigunguCd: r.b_code.slice(0, 5),
    bjdongCd:  r.b_code.slice(5, 10),
    bun:       r.main_address_no.padStart(4, '0'),
    ji:        (r.sub_address_no || '0').padStart(4, '0'),
  }
}

// ── 거래 데이터에서 단지별 대표 동명(umd_nm) 조회 ─────────────────
async function fetchUmdNmMap(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  // 각 단지에서 가장 빈번한 umd_nm 선택
  const { data, error } = await supabase.rpc('get_umd_nm_for_complexes', { complex_ids: ids })
  if (error || !data) {
    // RPC 없으면 직접 쿼리 (simple fallback)
    const { data: rows } = await supabase
      .from('transactions')
      .select('complex_id, umd_nm')
      .in('complex_id', ids)
      .not('umd_nm', 'is', null)
    const map = new Map<string, string>()
    if (rows) {
      const counts = new Map<string, Map<string, number>>()
      for (const r of rows as Array<{ complex_id: string; umd_nm: string }>) {
        if (!counts.has(r.complex_id)) counts.set(r.complex_id, new Map())
        const m = counts.get(r.complex_id)!
        m.set(r.umd_nm, (m.get(r.umd_nm) ?? 0) + 1)
      }
      for (const [cid, m] of counts) {
        const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
        if (top) map.set(cid, top[0])
      }
    }
    return map
  }
  return new Map(
    (data as Array<{ complex_id: string; umd_nm: string }>).map(r => [r.complex_id, r.umd_nm])
  )
}

// ── main ──────────────────────────────────────────────────────────
async function main() {
  const modeLabel = HOUSEHOLD_ZERO ? ' [세대수-zero]' : BLDRGST_ONLY ? ' [건축물대장-only]' : RETRY_MODE ? ' [retry+동명]' : SKIP_BLD ? ' [건축물대장 생략]' : ''
  console.log(`🏠 아파트 단지 보강 시작${DRY_RUN ? ' [DRY-RUN]' : ''}${modeLabel}`)

  const SGG_MAP = await getSggMap()
  const SGG_LABEL = buildSggLabel(SGG_MAP)

  let query = supabase
    .from('complexes')
    .select('id, canonical_name, sgg_code, lat, lng, kapt_code, household_count')
    .eq('building_type', 'apt')

  if (TARGET_ID) {
    query = query.eq('id', TARGET_ID)
  } else if (HOUSEHOLD_ZERO) {
    // household_count=0 또는 null + 좌표 있는 단지 (bbox로 오좌표 제외)
    query = query
      .not('lat', 'is', null)
      .or('household_count.eq.0,household_count.is.null')
      .gte('lat', BBOX.minLat).lte('lat', BBOX.maxLat)
      .gte('lng', BBOX.minLng).lte('lng', BBOX.maxLng)
  } else if (BLDRGST_ONLY) {
    // 좌표 있고 층수 없는 단지 → 건축물대장만
    query = query.not('lat', 'is', null).is('floors_above', null)
  } else {
    // 기본 + retry 공통: 좌표 없는 단지
    query = query.is('lat', null)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: complexes, error } = await (query as any)
  if (error) throw new Error(`complexes 조회 실패: ${error.message}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = complexes as any[]
  if (rows.length === 0) { console.log('✅ 보강할 단지 없음'); return }

  console.log(`📋 대상: ${rows.length}개 단지`)

  // retry 모드: 거래 데이터에서 동명 미리 수집
  const umdNmMap = RETRY_MODE
    ? await fetchUmdNmMap(rows.map((r: { id: string }) => r.id))
    : new Map<string, string>()
  if (RETRY_MODE) console.log(`  동명 확보: ${umdNmMap.size}개`)

  let success = 0, bldSuccess = 0, skipped = 0, failed = 0

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i]
    process.stdout.write(`\r[${i + 1}/${rows.length}] ${c.canonical_name} ...`)

    try {
      let lat: number
      let lng: number
      const complexUpdate: Record<string, unknown> = {}

      if (BLDRGST_ONLY || HOUSEHOLD_ZERO) {
        // ── 기존 좌표 사용 ────────────────────────────────────────
        lat = c.lat as number
        lng = c.lng as number
      } else {
        // ── Step 1: 카카오 키워드 검색 ──────────────────────────────
        const region = SGG_LABEL[c.sgg_code] ?? ''
        const dong   = umdNmMap.get(c.id) ?? ''
        let place: KakaoPlace | null = null

        if (RETRY_MODE && dong) {
          // retry: 동명으로 더 정확한 검색 (3단계 폴백)
          place = await kakaoKeywordSearch(`${c.canonical_name} ${dong}`)
          if (!place) place = await kakaoKeywordSearch(`${c.canonical_name} ${region} ${dong}`)
          if (!place) place = await kakaoKeywordSearch(`${c.canonical_name} ${region}`)
        } else {
          place = await kakaoKeywordSearch(`${c.canonical_name} ${region}`.trim())
          if (!place) place = await kakaoKeywordSearch(c.canonical_name)
        }

        if (!place) {
          skipped++
          await new Promise(r => setTimeout(r, 100))
          continue
        }

        lat = parseFloat(place.y)
        lng = parseFloat(place.x)
        if (isNaN(lat) || isNaN(lng)) { skipped++; continue }

        const sigu = SGG_MAP[c.sgg_code]
        complexUpdate.lat           = lat
        complexUpdate.lng           = lng
        complexUpdate.si            = sigu?.si ?? null
        complexUpdate.gu            = sigu?.gu ?? null
        complexUpdate.road_address  = place.road_address_name || null
        complexUpdate.jibun_address = place.address_name || null
      }

      // ── Step 2: 좌표 → dong + b_code + 지번 ─────────────────────
      await new Promise(r => setTimeout(r, 100))
      const addrResult = await kakaoCoordToAddr(lat, lng)

      if (!BLDRGST_ONLY && !HOUSEHOLD_ZERO && addrResult) {
        complexUpdate.dong = addrResult.dong
      }

      // ── Step 3: 건축물대장 표제부 ────────────────────────────────
      if (!SKIP_BLD && addrResult) {
        const bldParams = parseBldParams(addrResult)
        await new Promise(r => setTimeout(r, 200))
        const items = await fetchBldTitleInfo(bldParams)

        if (items.length > 0) {
          // 대표 동: grndFlrCnt/builtYear 기준 (hhldCnt 최대인 동)
          const bestItem = items.reduce((best, cur) =>
            (cur.hhldCnt ?? 0) > (best.hhldCnt ?? 0) ? cur : best,
          items[0]!)
          // 세대수는 모든 동의 합산 (다동 단지 대응)
          const totalHhldCnt = items.reduce((sum, cur) => sum + (cur.hhldCnt ?? 0), 0)

          const builtYear = bestItem.useAprDay ? parseInt(bestItem.useAprDay.slice(0, 4), 10) : null

          // household_count: 건축물대장 합산값이 0보다 클 때만 업데이트
          if (totalHhldCnt > 0 && !c.household_count)
            complexUpdate.household_count = totalHhldCnt
          if (bestItem.grndFlrCnt != null) complexUpdate.floors_above   = bestItem.grndFlrCnt
          if (bestItem.ugrndFlrCnt != null) complexUpdate.floors_below  = bestItem.ugrndFlrCnt
          if (builtYear && !isNaN(builtYear)) complexUpdate.built_year = builtYear

          bldSuccess++
          console.log(
            `\n  ✅ ${c.canonical_name} — 세대:${totalHhldCnt > 0 ? totalHhldCnt : '-'}, 지상:${bestItem.grndFlrCnt ?? '-'}F, 준공:${builtYear ?? '-'}`,
          )
        } else {
          console.log(`\n  📍 ${c.canonical_name} — 좌표만 (건축물대장 없음)`)
        }
      } else {
        console.log(`\n  📍 ${c.canonical_name} — (${lat.toFixed(5)}, ${lng.toFixed(5)})`)
      }

      if (!DRY_RUN) {
        const { error: cErr } = await supabase
          .from('complexes')
          .update(complexUpdate)
          .eq('id', c.id)
        if (cErr) throw new Error(`complexes 업데이트 실패: ${cErr.message}`)
      }

      success++
    } catch (err) {
      console.error(`\n  ❌ "${c.canonical_name}": ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }

    await new Promise(r => setTimeout(r, 150))
  }

  const bldNote = SKIP_BLD ? '' : `, 건축물대장 ${bldSuccess}개`
  console.log(`\n\n✅ 완료: ${success}개 성공${bldNote}, ${skipped}개 스킵, ${failed}개 실패`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
