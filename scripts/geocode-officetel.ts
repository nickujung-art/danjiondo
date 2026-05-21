/**
 * 오피스텔 단지 좌표 지오코딩
 *
 * 사용: npx tsx --env-file=.env.local scripts/geocode-officetel.ts
 *
 * 전략:
 *   - 이름이 지번 형태 (e.g. "(20-100)") → 카카오 주소검색 API (si+gu+dong+지번)
 *   - 일반 이름 → 카카오 키워드검색 API (이름+gu+dong)
 *   - 1차 실패 시 키워드 검색으로 재시도
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY

// 지번 형태 판별: (숫자), (숫자-숫자), (숫자-숫자-숫자)
const LOT_RE = /^\([\d-]+\)$/

function cleanLot(name: string) {
  return name.replace(/[()]/g, '').trim()
}

async function searchAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json')
  url.searchParams.set('query', query)
  url.searchParams.set('size', '1')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) return null
  const json = await res.json() as { documents?: Array<{ y: string; x: string }> }
  const doc = json.documents?.[0]
  return doc ? { lat: parseFloat(doc.y), lng: parseFloat(doc.x) } : null
}

async function searchKeyword(query: string): Promise<{ lat: number; lng: number } | null> {
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
  return doc ? { lat: parseFloat(doc.y), lng: parseFloat(doc.x) } : null
}

async function geocode(
  name: string,
  si: string | null,
  gu: string | null,
  dong: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const region = [si, gu, dong].filter(Boolean).join(' ')

  if (LOT_RE.test(name.trim())) {
    // 지번주소 형태: "창원시 마산합포구 중성동 20-100"
    const coord = await searchAddress(`${region} ${cleanLot(name)}`)
    if (coord) return coord
    // 실패 시 키워드 폴백 (거의 없지만)
    return searchKeyword(`${region} ${cleanLot(name)}`)
  }

  // 일반 이름: 키워드 검색 (이름 + 동 단위)
  const coord = await searchKeyword(`${name} ${region}`)
  if (coord) return coord
  // 이름만으로 재시도 (동 없이)
  return searchKeyword(`${name} ${[si, gu].filter(Boolean).join(' ')}`)
}

async function main() {
  if (!KAKAO_KEY) throw new Error('KAKAO_REST_API_KEY 없음')

  const { data: complexes, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, si, gu, dong')
    .eq('building_type', 'officetel')
    .is('lat', null)
    .order('gu')

  if (error) throw new Error(error.message)
  if (!complexes?.length) { console.log('지오코딩할 오피스텔 단지 없음'); return }

  console.log(`\n📍 오피스텔 ${complexes.length}개 지오코딩 시작\n`)
  let success = 0, failed = 0
  const failedList: string[] = []

  for (let i = 0; i < complexes.length; i++) {
    const c = complexes[i]!
    process.stdout.write(`[${i + 1}/${complexes.length}] ${c.gu} ${c.dong} "${c.canonical_name}" ... `)

    const coord = await geocode(c.canonical_name, c.si, c.gu, c.dong)
    if (coord) {
      const { error: updateErr } = await supabase
        .from('complexes')
        .update({ lat: coord.lat, lng: coord.lng })
        .eq('id', c.id)

      if (updateErr) {
        console.log(`DB오류: ${updateErr.message}`)
        failed++
        failedList.push(`${c.gu} ${c.dong} "${c.canonical_name}"`)
      } else {
        console.log(`✓ (${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)})`)
        success++
      }
    } else {
      console.log('✗ 좌표 없음')
      failed++
      failedList.push(`${c.gu} ${c.dong} "${c.canonical_name}"`)
    }

    await new Promise(r => setTimeout(r, 120))  // 카카오 API 레이트 제한 대비
  }

  console.log(`\n완료: ${success}개 성공 / ${failed}개 실패`)
  if (failedList.length > 0) {
    console.log('\n좌표 미확보 목록:')
    failedList.forEach(n => console.log(`  - ${n}`))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
