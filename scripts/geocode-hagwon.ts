/**
 * hagwon_db 주소 → Kakao 지오코딩 배치
 *
 * hagwon_db.location(PostGIS geometry) 컬럼을 Kakao 주소 검색 API로 채운다.
 * fetch-hagwon-neis.ts 실행 완료 후 실행.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/geocode-hagwon.ts --missing-only
 *   npx tsx --env-file=.env.local scripts/geocode-hagwon.ts --dry-run --limit=1
 *   npx tsx --env-file=.env.local scripts/geocode-hagwon.ts --all
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DRY_RUN     = process.argv.includes('--dry-run')
const MISSING_ONLY = !process.argv.includes('--all')
const LIMIT_ARG   = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]
const LIMIT       = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : 1000

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null
  const url = new URL('https://dapi.kakao.com/v2/local/search/address.json')
  url.searchParams.set('query', address)
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY!}` },
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
  if (!process.env.KAKAO_REST_API_KEY) {
    console.error('KAKAO_REST_API_KEY 환경변수가 없습니다.')
    process.exit(1)
  }

  // PostgREST max_rows=1000 → 페이지네이션으로 전수 수집
  type Row = { id: string; name: string; address: string | null; address_detail: string | null }
  const rows: Row[] = []
  const PAGE = 1000
  let offset = 0
  while (true) {
    let q = supabase.from('hagwon_db').select('id, name, address, address_detail')
    if (MISSING_ONLY) q = q.is('location', null)
    const { data, error } = await q.order('id').range(offset, offset + PAGE - 1)
    if (error) { console.error('hagwon_db 조회 실패:', error.message); process.exit(1) }
    if (!data?.length) break
    rows.push(...(data as Row[]))
    if (data.length < PAGE || (LIMIT > 0 && rows.length >= LIMIT)) break
    offset += PAGE
  }
  if (LIMIT > 0 && rows.length > LIMIT) rows.length = LIMIT
  if (!rows.length) { console.log('처리할 행 없음'); return }

  const total = rows.length
  let geocoded = 0
  let notFound = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    // 도로명주소 우선, 없으면 상세주소 포함
    const addr = row.address
      ? (row.address_detail ? `${row.address} ${row.address_detail}` : row.address)
      : null

    if (!addr) {
      notFound++
    } else {
      const coords = await geocodeAddress(addr)
      if (coords) {
        if (!DRY_RUN) {
          // PostGIS WKT: SRID=4326;POINT(lng lat) — 경도 먼저
          const { error: updErr } = await supabase
            .from('hagwon_db')
            .update({ location: `SRID=4326;POINT(${coords.lng} ${coords.lat})` })
            .eq('id', row.id)
          if (updErr) {
            console.warn(`[경고] ${row.name} 업데이트 실패:`, updErr.message)
          }
        } else {
          console.log(`[dry-run] ${row.name} → lat:${coords.lat}, lng:${coords.lng}`)
        }
        geocoded++
      } else {
        console.warn(`[not_found] ${row.name} | ${addr}`)
        notFound++
      }
    }

    await sleep(100)

    if ((i + 1) % 100 === 0 || i === rows.length - 1) {
      console.log(`[진행] ${i + 1}/${total} 완료 (geocoded: ${geocoded}, not_found: ${notFound})`)
    }
  }

  console.log(`\n완료: ${geocoded}건 geocoded, ${notFound}건 not_found`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
