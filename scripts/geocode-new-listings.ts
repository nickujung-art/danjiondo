/**
 * new_listings.hssply_adres → lat/lng 지오코딩
 * Kakao Address Search API 사용
 * 실행: npx tsx scripts/geocode-new-listings.ts
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

interface KakaoAddressResult {
  documents: Array<{ x: string; y: string; address_name: string }>
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) {
    console.warn(`  Kakao HTTP ${res.status}`)
    return null
  }
  const json = await res.json() as KakaoAddressResult
  const doc = json.documents?.[0]
  if (!doc) return null
  return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) }
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const { data: listings, error } = await supabase
    .from('new_listings')
    .select('id, pblanc_nm, hssply_adres')
    .not('hssply_adres', 'is', null)
    .is('lat', null)

  if (error) throw error

  if (!listings?.length) {
    console.log('지오코딩할 항목 없음 (lat이 null인 new_listings 없음)')
    return
  }

  console.log(`지오코딩 대상: ${listings.length}건`)

  let ok = 0, miss = 0, err = 0

  for (const listing of listings) {
    const name    = (listing.pblanc_nm   as string | null) ?? listing.id
    const address = listing.hssply_adres as string

    const coords = await geocodeAddress(address)
    if (!coords) {
      console.warn(`[MISS] ${name}: ${address}`)
      miss++
    } else {
      const { error: upErr } = await supabase
        .from('new_listings')
        .update({ lat: coords.lat, lng: coords.lng })
        .eq('id', listing.id)
      if (upErr) {
        console.error(`[ERR]  ${name}: ${upErr.message}`)
        err++
      } else {
        console.log(`[OK]   ${name}: ${coords.lat}, ${coords.lng}`)
        ok++
      }
    }

    await sleep(300)  // 초당 ~3 req, 무료 QPS 내
  }

  console.log(`\n완료 — 성공: ${ok} / 미매칭: ${miss} / 오류: ${err}`)
}

main().catch(console.error)
