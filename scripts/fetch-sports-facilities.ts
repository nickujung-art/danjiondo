/**
 * 체육도장 데이터 수집 배치 스크립트
 *
 * 출처: 행정안전부_생활_체육도장업 조회서비스 (data.go.kr)
 * 대상: 창원시(48120) + 김해시(48250)
 * 매칭: 단지 좌표 기준 반경 1.5km 이내 체육시설 → facility_poi(category='sports')
 *
 * 실행: npx tsx --env-file=.env.local scripts/fetch-sports-facilities.ts
 *
 * 준비:
 *   1. data.go.kr 마이페이지 → 활용신청 목록 → 체육도장업 서비스 승인 확인
 *   2. 발급된 serviceKey를 .env.local에 LOCALDATA_SPORTS_API_KEY=... 로 추가
 *   3. src/services/localdata-sports.ts의 BASE URL을 실제 엔드포인트로 교체
 */
import { createClient } from '@supabase/supabase-js'
import { fetchAllSportsFacilities } from '../src/services/localdata-sports'
import { classifySport } from '../src/lib/sports-category'

// 수집 대상 시군구 코드
const SGG_CODES = [
  { code: '48120', name: '창원시' },
  { code: '48250', name: '김해시' },
]

const RADIUS_M = 1500  // 단지 기준 반경 1.5km

interface Complex {
  id: string
  lat: number
  lng: number
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function geocodeAddress(address: string, kakaoKey: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json')
  url.searchParams.set('query', address)
  url.searchParams.set('size', '1')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${kakaoKey}` },
    signal:  AbortSignal.timeout(8_000),
  })
  if (!res.ok) return null

  const json = await res.json() as { documents?: Array<{ x: string; y: string }> }
  const doc = json.documents?.[0]
  if (!doc) return null
  return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) }
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const kakaoKey = process.env.KAKAO_REST_API_KEY!

  // ① 모든 단지 좌표 로드
  const { data: complexRows, error: cErr } = await supabase
    .from('complexes')
    .select('id, lat, lng')
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (cErr) { console.error('단지 로드 실패:', cErr.message); process.exit(1) }
  const complexes: Complex[] = complexRows
  console.log(`단지 로드: ${complexes.length}개`)

  // ② 체육도장 수집
  let allFacilities: Awaited<ReturnType<typeof fetchAllSportsFacilities>> = []
  for (const { code, name } of SGG_CODES) {
    console.log(`\n[${name}] 수집 중...`)
    const items = await fetchAllSportsFacilities(code)
    console.log(`  → ${items.length}개`)
    allFacilities = allFacilities.concat(items)
  }
  console.log(`\n전체 체육도장: ${allFacilities.length}개`)

  // ③ 좌표 없는 업체 지오코딩 (카카오 주소 검색)
  let geocoded = 0
  let geocodeFail = 0
  for (const f of allFacilities) {
    if (f.lat && f.lng) continue
    const coord = await geocodeAddress(f.address, kakaoKey)
    if (coord) {
      f.lat = coord.lat
      f.lng = coord.lng
      geocoded++
    } else {
      geocodeFail++
    }
    // 카카오 API 과부하 방지
    await new Promise(r => setTimeout(r, 50))
  }
  console.log(`지오코딩: +${geocoded}개 성공, ${geocodeFail}개 실패`)

  const withCoords = allFacilities.filter(f => f.lat && f.lng)
  console.log(`좌표 보유: ${withCoords.length}/${allFacilities.length}개`)

  // ④ 단지-체육시설 매칭 + upsert
  const rows: Array<{
    complex_id: string
    category:   string
    sport_type: string
    poi_name:   string
    distance_m: number
    lat:        number
    lng:        number
  }> = []

  for (const facility of withCoords) {
    const sportType = classifySport(facility.uptaeNm || facility.bizNm)

    for (const cx of complexes) {
      const dist = haversineM(cx.lat, cx.lng, facility.lat!, facility.lng!)
      if (dist <= RADIUS_M) {
        rows.push({
          complex_id: cx.id,
          category:   'sports',
          sport_type: sportType,
          poi_name:   facility.bizNm,
          distance_m: Math.round(dist),
          lat:        facility.lat!,
          lng:        facility.lng!,
        })
      }
    }
  }

  console.log(`\n매칭된 (단지 × 체육시설) 행: ${rows.length}개`)

  if (rows.length === 0) {
    console.log('매칭 결과 없음 — 엔드포인트 URL 또는 API 키를 확인하세요.')
    process.exit(0)
  }

  // 배치 upsert (500개씩)
  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from('facility_poi')
      .upsert(batch, { onConflict: 'complex_id,category,poi_name' })
    if (error) {
      console.error(`upsert 오류 (배치 ${i / BATCH + 1}):`, error.message)
    } else {
      inserted += batch.length
    }
  }

  console.log(`✓ upsert 완료: ${inserted}행`)

  // 종목별 요약
  const summary: Record<string, number> = {}
  for (const r of rows) {
    summary[r.sport_type] = (summary[r.sport_type] ?? 0) + 1
  }
  console.log('\n종목별 연결 수:')
  for (const [type, cnt] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(12)} ${cnt}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
