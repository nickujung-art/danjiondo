/**
 * 청약홈 분양 공고 수집 스크립트 (1회성 수동 실행용)
 * 사용: npx tsx --env-file=.env.local scripts/fetch-cheongyak.ts
 */
import { createClient } from '@supabase/supabase-js'
import { fetchCheongyakList, fetchCompetitionRate, CHEONGYAK_SGG_CODES } from '../src/services/cheongyak/client'
import { normalizeCheongyakItem } from '../src/services/cheongyak/normalize'

async function main() {
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

let upserted = 0
let competitionUpdated = 0
const errors: string[] = []
const pblancNos: string[] = []

// fetchCheongyakList는 내부에서 전체 조회 후 창원·김해 필터링
console.log(`청약홈 수집 중...`)
{
  const sggCode = 'all'
  try {
    const items = await fetchCheongyakList()
    console.log(`  → ${items.length}건 수신 (창원·김해 필터)`)

    for (const item of items) {
      const row = normalizeCheongyakItem(item)
      const { error } = await supabase
        .from('new_listings')
        .upsert(
          {
            name:                row.name,
            region:              row.region,
            pblanc_no:           row.pblanc_no,
            pblanc_nm:           row.pblanc_nm,
            sgg_code:            row.sgg_code,
            supply_region:       row.supply_region,
            supply_count:        row.supply_count,
            rcept_bgnde:         row.rcept_bgnde,
            rcept_endde:         row.rcept_endde,
            przwner_presnatn_de: row.przwner_presnatn_de,
            mvn_prearnge_ym:     row.mvn_prearnge_ym,
            hssply_adres:        row.hssply_adres,
            is_active:           true,
            fetched_at:          row.fetched_at,
          },
          { onConflict: 'pblanc_no' },
        )
      if (!error) {
        upserted++
        pblancNos.push(row.pblanc_no)
      } else {
        errors.push(`upsert pblanc_no=${row.pblanc_no}: ${error.message}`)
      }
    }
  } catch (err) {
    errors.push(`fetch: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// 경쟁률 병합
console.log(`\n경쟁률 수집 중... ${pblancNos.length}건`)
for (const pblancNo of pblancNos) {
  try {
    const rate = await fetchCompetitionRate(pblancNo)
    if (rate == null) continue
    const { error } = await supabase
      .from('new_listings')
      .update({ competition_rate: rate })
      .eq('pblanc_no', pblancNo)
    if (!error) competitionUpdated++
    else errors.push(`competition pblanc_no=${pblancNo}: ${error.message}`)
  } catch (err) {
    errors.push(`competition pblanc_no=${pblancNo}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

  // 만료 공고 비활성화
  const today = new Date().toISOString().slice(0, 10)
  const { data: expired } = await supabase
    .from('new_listings')
    .update({ is_active: false })
    .lt('rcept_endde', today)
    .not('pblanc_no', 'is', null)
    .eq('is_active', true)
    .select('id')

  console.log(`\n결과:`)
  console.log(`  upserted:           ${upserted}`)
  console.log(`  competitionUpdated: ${competitionUpdated}`)
  console.log(`  expiredDeactivated: ${expired?.length ?? 0}`)
  if (errors.length > 0) {
    console.log(`  errors (${errors.length}):`)
    errors.forEach(e => console.log(`    - ${e}`))
  } else {
    console.log(`  errors: 0`)
  }
}

main().catch(console.error)
