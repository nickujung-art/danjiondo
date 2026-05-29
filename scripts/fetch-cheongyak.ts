/**
 * 청약홈 분양 공고 수집 스크립트 (1회성 수동 실행용)
 * 사용: npx tsx --env-file=.env.local scripts/fetch-cheongyak.ts
 */
import { createClient } from '@supabase/supabase-js'
import { fetchCheongyakList, fetchRemndrList, fetchCompetitionRate, fetchModelPrices } from '../src/services/cheongyak/client'
import { normalizeCheongyakItem, normalizeRemndrItem } from '../src/services/cheongyak/normalize'
import type { NewListingCheongyakRow } from '../src/services/cheongyak/types'
import { fetchLhList, fetchLhDetail } from '../src/services/lh/client'
import { normalizeLhItem } from '../src/services/lh/normalize'

async function upsertRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  row: NewListingCheongyakRow,
  errors: string[],
  pblancNos: string[],
): Promise<number> {
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
        price_min:           row.price_min ?? null,
        price_max:           row.price_max ?? null,
        source_code:         row.source_code ?? null,
      },
      { onConflict: 'pblanc_no' },
    )
  if (!error) {
    pblancNos.push(row.pblanc_no)
    return 1
  }
  errors.push(`upsert pblanc_no=${row.pblanc_no}: ${error.message}`)
  return 0
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let upserted = 0
  let remndrUpserted = 0
  let competitionUpdated = 0
  const errors: string[] = []
  const pblancNos: string[] = []

  // ── 분양 공고 (최초 청약) ────────────────────────────────────────
  console.log('분양공고 수집 중...')
  try {
    const items = await fetchCheongyakList()
    console.log(`  → ${items.length}건 수신 (창원·김해)`)

    // 평형별 분양가 일괄 조회
    const allPblancNos = items.map(i => i.PBLANC_NO)
    console.log(`  → 분양가 조회 중 (${allPblancNos.length}건)...`)
    const priceMap = await fetchModelPrices(allPblancNos).catch(() => new Map())

    for (const item of items) {
      const prices = priceMap.get(item.PBLANC_NO)
      upserted += await upsertRow(supabase, normalizeCheongyakItem(item, prices), errors, pblancNos)
    }
  } catch (err) {
    errors.push(`fetchCheongyakList: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── LH 분양·임대 공고 ────────────────────────────────────────────
  console.log('\nLH 공급정보 수집 중...')
  let lhUpserted = 0
  try {
    const lhItems = await fetchLhList()
    console.log(`  → ${lhItems.length}건 수신 (창원·김해)`)
    for (const notice of lhItems) {
      const detail = await fetchLhDetail(notice).catch(() => null)
      const row = normalizeLhItem(notice, detail)
      lhUpserted += await upsertRow(supabase, row, errors, pblancNos)
    }
  } catch (err) {
    errors.push(`fetchLhList: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── 잔여세대·무순위 ──────────────────────────────────────────────
  console.log('\n잔여세대·무순위 수집 중...')
  try {
    const items = await fetchRemndrList()
    console.log(`  → ${items.length}건 수신 (창원·김해)`)
    for (const item of items) {
      remndrUpserted += await upsertRow(supabase, normalizeRemndrItem(item), errors, pblancNos)
    }
  } catch (err) {
    errors.push(`fetchRemndrList: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── 경쟁률 병합 ─────────────────────────────────────────────────
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

  // ── 만료 공고 비활성화 ───────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const { data: expired } = await supabase
    .from('new_listings')
    .update({ is_active: false })
    .lt('rcept_endde', today)
    .not('pblanc_no', 'is', null)
    .eq('is_active', true)
    .select('id')

  console.log('\n결과:')
  console.log(`  분양공고 upserted:    ${upserted}`)
  console.log(`  잔여세대 upserted:    ${remndrUpserted}`)
  console.log(`  LH 공급정보 upserted: ${lhUpserted}`)
  console.log(`  competitionUpdated:  ${competitionUpdated}`)
  console.log(`  expiredDeactivated:  ${expired?.length ?? 0}`)
  if (errors.length > 0) {
    console.log(`  errors (${errors.length}):`)
    errors.forEach(e => console.log(`    - ${e}`))
  } else {
    console.log('  errors: 0')
  }
}

main().catch(console.error)
