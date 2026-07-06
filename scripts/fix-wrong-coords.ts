/**
 * 창원/김해 bbox 밖 좌표를 가진 단지 자동 수정
 *
 * 카카오 키워드 검색으로 올바른 좌표를 찾아 업데이트한다.
 * 검색 결과가 bbox 내에 없으면 스킵 (별도 수동 처리 필요).
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/fix-wrong-coords.ts
 *   npx tsx --env-file=.env.local scripts/fix-wrong-coords.ts --dry-run
 *
 * 환경변수: KAKAO_REST_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { getActiveRegionAddrs, type RegionAddr } from '../src/lib/data/regions'

loadEnvConfig(process.cwd(), true)

if (!process.env.KAKAO_REST_API_KEY)         { console.error('❌ KAKAO_REST_API_KEY 없음');          process.exit(1) }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL)   { console.error('❌ NEXT_PUBLIC_SUPABASE_URL 없음');    process.exit(1) }
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)  { console.error('❌ SUPABASE_SERVICE_ROLE_KEY 없음');   process.exit(1) }

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// 경남 전체 유효 좌표 범위 (complexes-map.ts와 동일 기준, Phase 33 b59bd01)
const BBOX = { minLat: 34.7, maxLat: 35.8, minLng: 127.7, maxLng: 129.3 }

let SGG_LABEL: Record<string, string> = {}
let SGG_ADDR: Record<string, RegionAddr> = {}

async function loadRegionMaps(): Promise<void> {
  const rows = await getActiveRegionAddrs(supabase)
  SGG_LABEL = Object.fromEntries(rows.map(r => [r.sgg_code, r.gu ? `${r.si} ${r.gu}` : r.si]))
  SGG_ADDR = Object.fromEntries(rows.map(r => [r.sgg_code, r]))
}

// address_name에 해당 시군구 키워드가 포함되는지 확인
function isInRegion(addressName: string, sggCode: string): boolean {
  const region = SGG_ADDR[sggCode]
  if (!region) return false
  const a = addressName
  const siShort = region.si.replace(/(시|군)$/, '')
  if (!region.gu) return a.includes(siShort)
  return a.includes(siShort) && a.includes(region.gu.replace(/구$/, ''))
}

interface KakaoPlace {
  place_name: string
  address_name: string
  x: string  // lng
  y: string  // lat
}

async function kakaoSearch(query: string, sggCode: string): Promise<KakaoPlace | null> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json')
  url.searchParams.set('query', query)
  url.searchParams.set('size', '5')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY!}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) return null
  const json = await res.json() as { documents?: KakaoPlace[] }

  // bbox 내 + 해당 시군구 주소 일치 결과 선택
  for (const doc of json.documents ?? []) {
    const lat = parseFloat(doc.y)
    const lng = parseFloat(doc.x)
    const inBbox = lat >= BBOX.minLat && lat <= BBOX.maxLat && lng >= BBOX.minLng && lng <= BBOX.maxLng
    if (inBbox && isInRegion(doc.address_name, sggCode)) {
      return doc
    }
  }
  return null
}

async function main() {
  console.log(`🗺️  오좌표 단지 자동 수정 시작${DRY_RUN ? ' [DRY-RUN]' : ''}`)

  await loadRegionMaps()

  // bbox 밖 좌표를 가진 active 단지 조회
  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, sgg_code, lat, lng')
    .eq('status', 'active')
    .not('lat', 'is', null)
    .or(`lat.lt.${BBOX.minLat},lat.gt.${BBOX.maxLat},lng.lt.${BBOX.minLng},lng.gt.${BBOX.maxLng}`)

  if (error) throw new Error(`조회 실패: ${error.message}`)

  const rows = (complexes ?? []) as Array<{
    id: string; canonical_name: string; sgg_code: string; lat: number; lng: number
  }>

  console.log(`📋 대상: ${rows.length}개 단지\n`)

  let fixed = 0, notFound = 0

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i]!
    const region = SGG_LABEL[c.sgg_code] ?? c.sgg_code
    const query = `${c.canonical_name} ${region}`

    process.stdout.write(`\r[${i + 1}/${rows.length}] ${c.canonical_name} ...`)

    // 1차: "단지명 + 시군구" 검색
    let place = await kakaoSearch(query, c.sgg_code)

    // 2차: "단지명만" 검색 (시군구 없이)
    if (!place) {
      place = await kakaoSearch(c.canonical_name, c.sgg_code)
    }

    if (!place) {
      console.log(`\n  ⚠️  [${i + 1}] ${c.canonical_name} (${region}) — 검색 결과 없음`)
      notFound++
    } else {
      const newLat = parseFloat(place.y)
      const newLng = parseFloat(place.x)
      console.log(
        `\n  ✅ [${i + 1}] ${c.canonical_name} — (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}) → (${newLat.toFixed(4)}, ${newLng.toFixed(4)})  [${place.address_name}]`,
      )
      if (!DRY_RUN) {
        const { error: uErr } = await supabase
          .from('complexes')
          .update({ lat: newLat, lng: newLng })
          .eq('id', c.id)
        if (uErr) console.error(`    ❌ 업데이트 실패: ${uErr.message}`)
      }
      fixed++
    }

    await new Promise(r => setTimeout(r, 120))
  }

  console.log(`\n\n✅ 완료: ${fixed}개 수정, ${notFound}개 수동 처리 필요`)
  if (notFound > 0) {
    console.log('💡 수동 처리 필요 단지는 카카오맵에서 주소 확인 후 DB 직접 업데이트')
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
