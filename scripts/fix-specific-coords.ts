/**
 * 특정 단지 좌표 재지오코딩
 *
 * 전수조사에서 발견된 11개 단지(동일 좌표에 숨겨지는 쪽)를
 * 카카오 키워드 검색으로 재지오코딩하여 DB 업데이트.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/fix-specific-coords.ts
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

// 전수조사에서 확인된 재지오코딩 대상 11개
const TARGETS = [
  { id: '26bd5986-3345-468c-835f-711f9f539028', name: '현대1차아파트',        query: '현대1차아파트 반림동 창원시 성산구' },
  { id: '1d9794f0-4cc8-438f-b2e6-2608e03904fc', name: '풍림2차',              query: '풍림2차아파트 외동 김해시' },
  { id: 'c18f67a8-4094-4d18-adbe-577f989b6136', name: '풍림3차',              query: '풍림3차아파트 외동 김해시' },
  { id: '78ce30ef-fc6b-4226-b9f2-e3e418638979', name: '백조(구산동)',         query: '백조아파트 구산동 창원시 마산합포구' },
  { id: 'b230988a-e351-42e6-90cf-f7b90e2fb49a', name: '1차동원',              query: '동원아파트 1차 구산동 창원시 마산합포구' },
  { id: '3b6efd5c-e3b5-4853-9142-ab6c8bbb96d3', name: '김해2차한일',          query: '한일아파트 2차 구산동 창원시 마산합포구' },
  { id: '1e238ae0-1c91-4762-896c-7869af56ff7f', name: '해바라기맨션',         query: '해바라기맨션 도계동 창원시 의창구' },
  { id: 'b0d55007-83ba-46f5-b4f1-9bca3e275e35', name: '감계아내에코프리미엄', query: '감계아이에코프리미엄 북면 창원시 의창구' },
  { id: '0163b21d-6079-418c-b284-0b409f88d24f', name: '중앙경동메르빌',       query: '경동메르빌 중앙동2가 창원시 마산합포구' },
  { id: '2f454069-a189-42cc-9c8f-828ec2c92719', name: '대흥오피스텔',         query: '대흥오피스텔 소답동 창원시 의창구' },
  { id: '52895d3b-91d5-45d4-8a75-0a3aab48b6da', name: '중리주공2단지아파트',  query: '중리주공2단지아파트 내서읍 창원시 마산회원구' },
] as const

async function searchKakao(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json')
  url.searchParams.set('query', query)
  url.searchParams.set('size', '1')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) {
    console.error(`  카카오 API 오류: ${res.status}`)
    return null
  }

  const json = await res.json() as { documents?: Array<{ y: string; x: string; address_name?: string }> }
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

async function main() {
  console.log(`🔍 재지오코딩 대상: ${TARGETS.length}개\n`)

  // 현재 DB 좌표 조회
  const ids = TARGETS.map(t => t.id)
  const { data: rows, error } = await supabase
    .from('complexes')
    .select('id, canonical_name, lat, lng')
    .in('id', ids)

  if (error) { console.error('DB 조회 실패:', error.message); process.exit(1) }

  const dbMap = new Map((rows ?? []).map((r: { id: string; canonical_name: string; lat: number; lng: number }) => [r.id, r]))

  let updated = 0, skipped = 0, failed = 0

  for (const target of TARGETS) {
    const row = dbMap.get(target.id)
    if (!row) {
      console.log(`  ⚠️  DB에 없음: ${target.name} (${target.id})`)
      failed++
      continue
    }

    process.stdout.write(`  [${target.name}] 검색: "${target.query}" ...`)
    const coord = await searchKakao(target.query)
    await new Promise(r => setTimeout(r, 200))

    if (!coord) {
      console.log(` ❌ 결과 없음`)
      failed++
      continue
    }

    const current = { lat: row.lat, lng: row.lng }
    const dist = distMeters(current, coord)

    if (dist < 30) {
      console.log(` ⏭ 동일 좌표 (${dist.toFixed(0)}m) — 스킵`)
      skipped++
      continue
    }

    const { error: updateErr } = await supabase
      .from('complexes')
      .update({ lat: coord.lat, lng: coord.lng })
      .eq('id', target.id)

    if (updateErr) {
      console.log(` ❌ DB 오류: ${updateErr.message}`)
      failed++
    } else {
      console.log(` ✅ ${dist.toFixed(0)}m 이동 → (${coord.lat.toFixed(6)}, ${coord.lng.toFixed(6)})`)
      updated++
    }
  }

  console.log(`\n완료: 업데이트 ${updated}개 / 스킵 ${skipped}개 / 실패 ${failed}개`)
  if (failed > 0) {
    console.log('⚠️  실패한 단지는 카카오에서 건물명이 다를 수 있음 — query 문자열 수정 후 재시도')
  }
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
