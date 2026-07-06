/**
 * lat=NULL 단지 좌표 보완 (지번 주소 geocoding)
 *
 * 1단계: transactions.jibun + umd_nm으로 전체 지번 주소 조합 → Kakao 주소 geocoding
 * 2단계: geocoding 실패 단지 → status='inactive' 처리 (--deactivate 플래그 필요)
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/fix-null-coords-jibun.ts
 *   npx tsx --env-file=.env.local scripts/fix-null-coords-jibun.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/fix-null-coords-jibun.ts --deactivate
 *
 * 환경변수: KAKAO_REST_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { getActiveRegionAddrs } from '../src/lib/data/regions'

loadEnvConfig(process.cwd(), true)

if (!process.env.KAKAO_REST_API_KEY)        { console.error('❌ KAKAO_REST_API_KEY 없음');         process.exit(1) }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL)  { console.error('❌ NEXT_PUBLIC_SUPABASE_URL 없음');   process.exit(1) }
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('❌ SUPABASE_SERVICE_ROLE_KEY 없음');  process.exit(1) }

const DRY_RUN    = process.argv.includes('--dry-run')
const DEACTIVATE = process.argv.includes('--deactivate')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// 경남 전체 유효 좌표 범위 (complexes-map.ts와 동일 기준, Phase 33 b59bd01)
const BBOX = { minLat: 34.7, maxLat: 35.8, minLng: 127.7, maxLng: 129.3 }

let SGG_LABEL: Record<string, string> = {}

async function loadRegionMaps(): Promise<void> {
  const rows = await getActiveRegionAddrs(supabase)
  SGG_LABEL = Object.fromEntries(rows.map(r => [r.sgg_code, r.gu ? `${r.si} ${r.gu}` : r.si]))
}

const HEADERS = { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY!}` }

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

async function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

/** Kakao 주소 검색 API — 지번/도로명 모두 시도 */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json')
  url.searchParams.set('query', address)
  url.searchParams.set('size', '1')
  const res = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(5_000) })
  if (!res.ok) return null
  const json = (await res.json()) as { documents?: { x: string; y: string; address_name: string }[] }
  const d = json.documents?.[0]
  if (!d) return null
  const lat = parseFloat(d.y), lng = parseFloat(d.x)
  if (lat < BBOX.minLat || lat > BBOX.maxLat || lng < BBOX.minLng || lng > BBOX.maxLng) return null
  return { lat, lng }
}

/** transactions에서 단지별 (umd_nm, jibun) 최빈값 집계 */
async function buildJibunMap(ids: string[]): Promise<Map<string, { umd_nm: string; jibun: string }>> {
  const result = new Map<string, { umd_nm: string; jibun: string }>()

  for (const batch of chunk(ids, 50)) {
    const { data: rows } = await supabase
      .from('transactions')
      .select('complex_id, umd_nm, jibun')
      .in('complex_id', batch)
      .not('umd_nm', 'is', null)
      .not('jibun', 'is', null)
      .is('cancel_date', null)
      .is('superseded_by', null)
      .limit(500)

    const cnt = new Map<string, Map<string, number>>()
    for (const r of (rows ?? []) as Array<{ complex_id: string; umd_nm: string; jibun: string }>) {
      if (!r.umd_nm || !r.jibun) continue
      const key = `${r.umd_nm}||${r.jibun}`
      if (!cnt.has(r.complex_id)) cnt.set(r.complex_id, new Map())
      const m = cnt.get(r.complex_id)!
      m.set(key, (m.get(key) ?? 0) + 1)
    }

    for (const [cid, m] of cnt) {
      const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
      if (top) {
        const [umd_nm, jibun] = top[0].split('||') as [string, string]
        result.set(cid, { umd_nm, jibun })
      }
    }
  }

  return result
}

async function main() {
  console.log(`📍 lat=NULL 단지 지번주소 geocoding 시작${DRY_RUN ? ' [DRY-RUN]' : ''}${DEACTIVATE ? ' [+DEACTIVATE]' : ''}`)

  await loadRegionMaps()

  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, sgg_code')
    .eq('status', 'active')
    .is('lat', null)

  if (error) throw new Error(`조회 실패: ${error.message}`)
  const rows = (complexes ?? []) as Array<{ id: string; canonical_name: string; sgg_code: string }>

  if (rows.length === 0) {
    console.log('✅ null 좌표 단지 없음')
    return
  }

  const jibunMap = await buildJibunMap(rows.map(r => r.id))
  const withJibun  = rows.filter(r => jibunMap.has(r.id)).length
  const withoutJibun = rows.length - withJibun
  console.log(`📋 대상: ${rows.length}개 단지 (지번 보유: ${withJibun}개, 지번 없음: ${withoutJibun}개)\n`)

  let fixed = 0
  const notFoundIds: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i]!
    const region = SGG_LABEL[c.sgg_code] ?? c.sgg_code
    const jibun  = jibunMap.get(c.id) ?? null

    process.stdout.write(`\r[${i + 1}/${rows.length}] ${c.canonical_name} ...`)

    let coords: { lat: number; lng: number } | null = null

    if (jibun) {
      // 시도 1: "경남 {시군구} {읍면동} {지번}" — 가장 구체적
      coords = await geocodeAddress(`경남 ${region} ${jibun.umd_nm} ${jibun.jibun}`)
      await delay(80)

      // 시도 2: "경남 {시군구} {읍면동}" — 지번 없이 읍면동만
      if (!coords) {
        coords = await geocodeAddress(`경남 ${region} ${jibun.umd_nm}`)
        await delay(80)
      }
    } else {
      // 지번 없음 — 시군구 중심으로 폴백 (좌표는 부정확하지만 지도에는 표시)
      coords = await geocodeAddress(`경남 ${region}`)
      await delay(80)
    }

    if (!coords) {
      notFoundIds.push(c.id)
      console.log(`\n  ❌ [${i + 1}] ${c.canonical_name} — geocoding 실패`)
    } else {
      const jibunTag = jibun ? ` [${jibun.umd_nm} ${jibun.jibun}]` : ' [시군구 중심]'
      console.log(`\n  ✅ [${i + 1}] ${c.canonical_name}${jibunTag} → (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`)
      if (!DRY_RUN) {
        const { error: uErr } = await supabase
          .from('complexes').update({ lat: coords.lat, lng: coords.lng }).eq('id', c.id)
        if (uErr) console.error(`    ❌ 업데이트 실패: ${uErr.message}`)
        else fixed++
      } else {
        fixed++
      }
    }
  }

  console.log(`\n\n✅ 완료: ${fixed}개 좌표 수정, ${notFoundIds.length}개 geocoding 실패`)

  if (notFoundIds.length > 0 && DEACTIVATE) {
    console.log(`\n🔴 geocoding 실패 ${notFoundIds.length}개 → status='inactive' 처리 중...`)
    if (!DRY_RUN) {
      const BATCH = 50
      let deactivated = 0
      for (const batch of chunk(notFoundIds, BATCH)) {
        const { error: dErr } = await supabase
          .from('complexes')
          .update({ status: 'inactive' })
          .in('id', batch)
        if (dErr) console.error(`  ❌ 비활성화 실패: ${dErr.message}`)
        else deactivated += batch.length
      }
      console.log(`  ✅ ${deactivated}개 inactive 처리 완료`)
    } else {
      console.log(`  [DRY-RUN] ${notFoundIds.length}개를 inactive로 변경 예정`)
    }
  } else if (notFoundIds.length > 0) {
    console.log(`💡 geocoding 실패 단지를 비활성화하려면 --deactivate 플래그 추가`)
  }
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
