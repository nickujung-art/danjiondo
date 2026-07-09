/**
 * 체육도장 데이터 수집 배치 스크립트
 *
 * 출처: 행정안전부_생활_체육도장업 조회서비스 (data.go.kr)
 * 전략: 전국 32,644건 수집 → regions.is_active=true 동적 조회 기반 주소(si) 필터 → 카카오 지오코딩 → 단지 매칭
 *
 * 실행: npx tsx --env-file=.env.local scripts/fetch-sports-facilities.ts
 * 소요 시간: 약 5~10분 (API 327페이지 + 지오코딩)
 */
import { createClient } from '@supabase/supabase-js'
import { fetchSportsFacilitiesByAddress } from '../src/services/localdata-sports'
import { classifySport } from '../src/lib/sports-category'

// 대상 지역: regions 테이블 동적 조회 (is_active=true) — si 이름 목록 중복 제거
// 정적 지역 배열 대신 런타임 조회하여 신규 광역시 확장 시 코드 변경 불필요
async function loadAddressKeywords(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('si')
    .eq('is_active', true)
  if (error) throw new Error(`regions 조회 실패: ${error.message}`)
  return [...new Set((data ?? []).map((r: { si: string }) => r.si))] as string[]
}

const RADIUS_M = 1500

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

async function geocode(
  address: string,
  kakaoKey: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json')
  url.searchParams.set('query', address)
  url.searchParams.set('size', '1')
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${kakaoKey}` },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const json = await res.json() as { documents?: Array<{ x: string; y: string }> }
    const doc = json.documents?.[0]
    if (!doc) return null
    return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) }
  } catch {
    return null
  }
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const kakaoKey = process.env.KAKAO_REST_API_KEY!

  // ① 단지 좌표 로드 (PostgREST 1,000행 기본 캡 우회 — 페이지네이션)
  const PAGE = 1000
  const complexes: Complex[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data: complexRows, error: cErr } = await supabase
      .from('complexes')
      .select('id, lat, lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .range(offset, offset + PAGE - 1)
    if (cErr) { console.error('단지 로드 실패:', cErr.message); process.exit(1) }
    if (!complexRows || complexRows.length === 0) break
    complexes.push(...(complexRows as Complex[]))
    if (complexRows.length < PAGE) break
  }
  console.log(`단지 로드: ${complexes.length}개`)

  // ② 전국 수집 → 활성 지역(si) 필터 (regions 동적 조회)
  const addressKeywords = await loadAddressKeywords(supabase)
  console.log(`\n체육도장 수집 중 (전국 ~327페이지, 약 3~5분, 대상: ${addressKeywords.join('/')})...`)
  let lastLog = 0
  const facilities = await fetchSportsFacilitiesByAddress(
    addressKeywords,
    (page, total) => {
      if (page === total || page - lastLog >= 50) {
        console.log(`  페이지 ${page}/${total} (누적: ${page === 1 ? '?' : '...'}개)`)
        lastLog = page
      }
    },
  )
  console.log(`\n대상 지역 체육도장: ${facilities.length}개`)

  if (facilities.length === 0) {
    console.log('결과 없음 — 주소 키워드 또는 API 응답 확인 필요')
    process.exit(0)
  }

  // ③ 카카오 지오코딩 (TM 좌표 대신 주소 기반 WGS84 취득)
  console.log('\n카카오 지오코딩 중...')
  const withCoords: Array<typeof facilities[0] & { lat: number; lng: number }> = []
  let geocodeFail = 0

  for (let i = 0; i < facilities.length; i++) {
    const f = facilities[i]!
    const coord = await geocode(f.address, kakaoKey)
    if (coord) {
      withCoords.push({ bizNm: f.bizNm, uptaeNm: f.uptaeNm, address: f.address, lat: coord.lat, lng: coord.lng })
    } else {
      geocodeFail++
    }
    if ((i + 1) % 100 === 0 || i === facilities.length - 1) {
      console.log(`  ${i + 1}/${facilities.length} (실패: ${geocodeFail})`)
    }
    await new Promise(r => setTimeout(r, 50))
  }
  console.log(`지오코딩 완료: ${withCoords.length}개 성공, ${geocodeFail}개 실패`)

  // ④ 단지-체육시설 반경 매칭 (동일 시설 중복 최단거리 기준 dedup)
  console.log('\n단지 매칭 중...')
  // key: `${complex_id}::${poi_name}` → 최단거리 행만 유지
  const rowMap = new Map<string, {
    complex_id: string
    category:   string
    sport_type: string
    poi_name:   string
    distance_m: number
    lat:        number
    lng:        number
  }>()

  for (const f of withCoords) {
    const sportType = classifySport(f.uptaeNm || f.bizNm)
    for (const cx of complexes) {
      const dist = haversineM(cx.lat, cx.lng, f.lat, f.lng)
      if (dist <= RADIUS_M) {
        const key = `${cx.id}::${f.bizNm}`
        const existing = rowMap.get(key)
        if (!existing || dist < existing.distance_m) {
          rowMap.set(key, {
            complex_id: cx.id,
            category:   'sports_dojo',
            sport_type: sportType,
            poi_name:   f.bizNm,
            distance_m: Math.round(dist),
            lat:        f.lat,
            lng:        f.lng,
          })
        }
      }
    }
  }
  const rows = Array.from(rowMap.values())
  console.log(`매칭된 행 (dedup 후): ${rows.length}개`)

  if (rows.length === 0) {
    console.log('매칭 없음 — 단지 좌표와 체육시설 좌표 범위 확인 필요')
    process.exit(0)
  }

  // ⑤ 기존 sports 데이터 삭제 후 재적재 (월 갱신)
  console.log('\n기존 sports 데이터 삭제 중...')
  const { error: delErr } = await supabase
    .from('facility_poi')
    .delete()
    .eq('category', 'sports_dojo')
  if (delErr) console.warn('삭제 오류 (무시):', delErr.message)

  // ⑥ 배치 upsert
  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from('facility_poi')
      .insert(batch)
    if (error) console.error(`insert 오류 (배치 ${Math.floor(i / BATCH) + 1}):`, error.message)
    else inserted += batch.length
  }
  console.log(`\n✓ 완료: ${inserted}행 적재`)

  // 종목별 요약
  const summary: Record<string, number> = {}
  for (const r of rows) summary[r.sport_type] = (summary[r.sport_type] ?? 0) + 1
  console.log('\n종목별 연결 수:')
  for (const [type, cnt] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(12)} ${cnt}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
