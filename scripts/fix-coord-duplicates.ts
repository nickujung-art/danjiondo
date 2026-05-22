/**
 * 좌표 중복 단지 재지오코딩
 *
 * 동일 좌표를 가진 단지 쌍 중 양쪽 모두 tx_count_30d > 0인 경우만 처리.
 * 더 구체적인 쿼리(dong 포함)로 재검색 → 다른 좌표가 나오면 업데이트.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/fix-coord-duplicates.ts
 *
 * 환경변수 필요:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KAKAO_REST_API_KEY
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const KAKAO_KEY   = process.env.KAKAO_REST_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY || !KAKAO_KEY) {
  console.error('❌ 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / KAKAO_REST_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

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

function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.sqrt(
    Math.pow((a.lat - b.lat) * 111_000, 2) +
    Math.pow((a.lng - b.lng) * 88_000, 2),
  )
}

type ComplexRow = {
  id: string; canonical_name: string; lat: number; lng: number
  dong: string | null; gu: string | null; si: string | null
  tx_count_30d: number; view_count: number; household_count: number | null
}

async function fetchAll(): Promise<ComplexRow[]> {
  const PAGE = 1000
  const result: ComplexRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('complexes')
      .select('id, canonical_name, lat, lng, dong, gu, si, tx_count_30d, view_count, household_count')
      .in('sgg_code', ['48121','48123','48125','48127','48129','48250','48720'])
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .not('status', 'in', '(demolished,merged,rental)')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    result.push(...(data as ComplexRow[]))
    if (data.length < PAGE) break
    offset += PAGE
  }
  return result
}

async function main() {
  const all = await fetchAll()
  if (all.length === 0) return

  // toFixed(6) 그룹핑
  const coordMap = new Map<string, ComplexRow[]>()
  for (const c of all) {
    const key = `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`
    const group = coordMap.get(key) ?? []
    group.push(c)
    coordMap.set(key, group)
  }

  // 중복 그룹 중 양쪽 tx > 0인 것만
  const targets: ComplexRow[] = []
  for (const group of coordMap.values()) {
    if (group.length < 2) continue
    const txPositive = group.filter(c => c.tx_count_30d > 0)
    if (txPositive.length < 2) continue
    // 스코어가 낮은 것이 dedup에서 지는 쪽
    const sorted = group
      .filter(c => c.tx_count_30d > 0)
      .sort((a, b) =>
        (a.tx_count_30d * 1000 + a.view_count * 10 + (a.household_count ?? 0)) -
        (b.tx_count_30d * 1000 + b.view_count * 10 + (b.household_count ?? 0)),
      )
    // 스코어 최하위 (dedup에서 숨겨지는 쪽)를 재지오코딩
    targets.push(...sorted.slice(0, -1))
  }

  if (targets.length === 0) {
    console.log('✅ 수정이 필요한 좌표 중복 단지 없음')
    return
  }

  console.log(`🔍 재지오코딩 대상: ${targets.length}개`)
  let updated = 0, skipped = 0, failed = 0

  for (const c of targets) {
    const location = [c.dong, c.gu, c.si].filter(Boolean).join(' ')
    // 더 구체적인 쿼리: "단지명 동구시"
    const query = `${c.canonical_name} ${location}`.trim()
    process.stdout.write(`\r  [${c.canonical_name}] 검색 중: "${query}" ...`)

    const coord = await searchKakao(query)
    await new Promise(r => setTimeout(r, 150))  // rate limit

    if (!coord) {
      console.log(`\n  ⚠️  결과 없음: ${c.canonical_name}`)
      failed++
      continue
    }

    const dist = distMeters(c, coord)
    if (dist < 30) {
      console.log(`\n  ⏭  동일 좌표 (${dist.toFixed(0)}m): ${c.canonical_name}`)
      skipped++
      continue
    }

    const { error: updateErr } = await supabase
      .from('complexes')
      .update({ lat: coord.lat, lng: coord.lng })
      .eq('id', c.id)

    if (updateErr) {
      console.log(`\n  ❌  DB 오류: ${c.canonical_name}: ${updateErr.message}`)
      failed++
    } else {
      console.log(`\n  ✅  업데이트 (${dist.toFixed(0)}m 이동): ${c.canonical_name} → ${coord.lat.toFixed(6)}, ${coord.lng.toFixed(6)}`)
      updated++
    }
  }

  console.log(`\n완료: 업데이트 ${updated}개, 동일좌표 스킵 ${skipped}개, 실패 ${failed}개`)
  if (skipped > 0) {
    console.log('⚠️  스킵된 단지는 같은 건물(동일 주소)의 1차/2차일 가능성 높음 — 수동 확인 필요')
  }
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
