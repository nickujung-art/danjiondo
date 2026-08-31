/**
 * presale_enriched ↔ new_listings 동기화 스크립트.
 *
 * 활성 new_listings 중 presale_enriched에 대응 행이 없는 것을 skeleton INSERT 한다.
 * 이름 일치하는 기존 enriched 행이 있으면 new_listing_id만 UPDATE 한다.
 *
 * 실행: npx tsx scripts/sync-presale-enriched.ts
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
)

/** hssply_adres에서 5자리 시군구코드를 추출한다. */
const ADDRESS_TO_SGG: [RegExp, string][] = [
  // 창원 5구
  [/창원시\s*의창구/, '48121'],
  [/창원시\s*성산구/, '48123'],
  [/창원시\s*마산합포구/, '48125'],
  [/창원시\s*마산회원구/, '48127'],
  [/창원시\s*진해구/, '48129'],
  // 경남 시군
  [/진주시/, '48170'],
  [/통영시/, '48220'],
  [/사천시/, '48240'],
  [/김해시/, '48250'],
  [/밀양시/, '48270'],
  [/거제시/, '48310'],
  [/양산시/, '48330'],
  [/의령군/, '48720'],
  [/함안군/, '48730'],
  [/창녕군/, '48740'],
  [/고성군/, '48820'],
  [/남해군/, '48840'],
  [/하동군/, '48850'],
  [/산청군/, '48860'],
  [/함양군/, '48870'],
  [/거창군/, '48880'],
  [/합천군/, '48890'],
  // 부산 16구
  [/부산.*중구/, '26110'],   [/부산.*서구/, '26140'],   [/부산.*동구/, '26170'],
  [/부산.*영도구/, '26200'], [/부산.*부산진구/, '26230'], [/부산.*동래구/, '26260'],
  [/부산.*남구/, '26290'],   [/부산.*북구/, '26320'],   [/부산.*해운대구/, '26350'],
  [/부산.*사하구/, '26380'], [/부산.*금정구/, '26410'],  [/부산.*강서구/, '26440'],
  [/부산.*연제구/, '26470'], [/부산.*수영구/, '26500'],  [/부산.*사상구/, '26530'],
  [/부산.*기장군/, '26710'],
]

function extractSggCode(address: string | null): string | null {
  if (!address) return null
  for (const [re, code] of ADDRESS_TO_SGG) {
    if (re.test(address)) return code
  }
  return null
}

interface Listing {
  id: string
  name: string
  pblanc_nm: string | null
  hssply_adres: string | null
  supply_count: number | null
}

async function main() {
  // 1. 활성 new_listings 조회
  const { data: listings, error: listErr } = await supabase
    .from('new_listings')
    .select('id, name, pblanc_nm, hssply_adres, supply_count')
    .eq('is_active', true)

  if (listErr) { console.error('new_listings 조회 실패:', listErr.message); process.exit(1) }
  if (!listings?.length) { console.log('활성 new_listings 없음'); return }

  console.log(`활성 new_listings: ${listings.length}건`)

  // 2. 이미 연결된 enriched 행 조회
  const { data: linked } = await supabase
    .from('presale_enriched')
    .select('new_listing_id')
    .not('new_listing_id', 'is', null)

  const linkedIds = new Set((linked ?? []).map(r => r.new_listing_id))

  // 3. 미연결 목록 필터
  const unlinked = (listings as Listing[]).filter(l => !linkedIds.has(l.id))
  if (!unlinked.length) { console.log('모두 이미 연결됨'); return }

  console.log(`미연결: ${unlinked.length}건`)

  let created = 0
  let updated = 0

  for (const listing of unlinked) {
    const enrichedName = listing.pblanc_nm ?? listing.name

    // 이름 일치하는 기존 enriched 행이 있는지 확인
    const { data: existing } = await supabase
      .from('presale_enriched')
      .select('id')
      .eq('name', enrichedName)
      .is('new_listing_id', null)
      .limit(1)
      .maybeSingle()

    if (existing) {
      // 기존 행에 new_listing_id 연결
      await supabase
        .from('presale_enriched')
        .update({ new_listing_id: listing.id })
        .eq('id', existing.id)
      console.log(`  [연결] ${enrichedName} → ${listing.id}`)
      updated++
    } else {
      // skeleton INSERT
      const sggCode = extractSggCode(listing.hssply_adres)
      const { error: insErr } = await supabase
        .from('presale_enriched')
        .insert({
          name: enrichedName,
          new_listing_id: listing.id,
          sgg_code: sggCode,
          address: listing.hssply_adres,
          total_units: listing.supply_count,
          source_type: 'listing_sync',
        })

      if (insErr) {
        console.log(`  [실패] ${enrichedName}: ${insErr.message}`)
      } else {
        console.log(`  [생성] ${enrichedName} (sgg=${sggCode ?? '?'})`)
        created++
      }
    }
  }

  console.log(`\n완료: 생성 ${created}건, 연결 ${updated}건`)
}

main().catch(e => { console.error(e); process.exit(1) })
