import { verifyCronSecret } from '@/lib/cron-auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { markCronStatus, markCronSuccess, markCronFailed } from '@/lib/data/cron-status'
import { computeGapStats } from '@/lib/data/gap-stats'
import { fetchKaptBasicInfo } from '@/services/kapt'
import {
  fetchPresaleTrades,
  parseAmount,
  currentYearMonth,
} from '@/services/molit-presale'
import { fetchCheongyakList, fetchRemndrList, fetchCompetitionRate } from '@/services/cheongyak/client'
import { normalizeCheongyakItem, normalizeRemndrItem } from '@/services/cheongyak/normalize'
import { ingestOffiMonth } from '@/lib/data/realprice-officetel'
import { getActiveSggCodes, getActiveCityNames } from '@/lib/data/regions'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const errors: string[] = []
  let totalUpserted = 0
  let cheongyakUpserted = 0
  let remndrUpserted = 0
  let competitionUpdated = 0
  let expiredDeactivated = 0
  let offiUpserted = 0
  let gapUpdated = 0

  // ── K-apt 부대시설 UPSERT (DATA-01) ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createSupabaseAdminClient() as any
  const activeSggCodes = await getActiveSggCodes(supabase)
  const { data: complexesWithKaptCode } = await supabase
    .from('complexes')
    .select('id, kapt_code')
    .not('kapt_code', 'is', null)
    .limit(50)

  let kaptUpserted = 0
  for (const complex of complexesWithKaptCode ?? []) {
    if (!complex.kapt_code) continue
    try {
      const info = await fetchKaptBasicInfo(complex.kapt_code)
      if (!info) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const facilityKaptTable = supabase.from('facility_kapt') as any
      const { error } = await facilityKaptTable.upsert(
        {
          complex_id:      complex.id,
          kapt_code:       info.kaptCode,
          heat_type:       info.heatType ?? null,
          management_type: info.managementType ?? null,
          total_area:      info.totalArea ?? null,
          data_month:      new Date().toISOString().slice(0, 7) + '-01',
        },
        { onConflict: 'complex_id' },
      ) as { error: { message: string } | null }
      if (!error) kaptUpserted++
    } catch (err) {
      errors.push(`kapt=${complex.kapt_code}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  totalUpserted += kaptUpserted

  // ── MOLIT 분양권전매 UPSERT (DATA-02) ────────────────────────────────
  const dealYmd = currentYearMonth()
  let presaleUpserted = 0

  for (const lawdCd of activeSggCodes) {
    try {
      const trades = await fetchPresaleTrades(lawdCd, dealYmd)
      for (const trade of trades) {
        const { data: listing } = await supabase
          .from('new_listings')
          .upsert(
            {
              name: trade.aptNm,
              region: trade.umdNm,
              price_min: parseAmount(trade.dealAmount),
              price_max: parseAmount(trade.dealAmount),
              fetched_at: new Date().toISOString(),
            },
            { onConflict: 'name,region' },
          )
          .select('id')
          .single()

        if (!listing) continue
        const listingId = (listing as { id: string }).id
        const dealDate = `${trade.dealYear}-${trade.dealMonth.padStart(2, '0')}-${trade.dealDay.padStart(2, '0')}`

        const { error } = await supabase
          .from('presale_transactions')
          .upsert(
            {
              listing_id:  listingId,
              area:        trade.excluUseAr ?? null,
              floor:       trade.floor ?? null,
              price:       parseAmount(trade.dealAmount),
              deal_date:   dealDate,
              cancel_date: trade.cdealType === 'Y' ? dealDate : null,
            },
            { onConflict: 'listing_id,deal_date,area,floor', ignoreDuplicates: true },
          )
        if (!error) presaleUpserted++
      }
    } catch (err) {
      errors.push(`presale lawdCd=${lawdCd}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  totalUpserted += presaleUpserted

  // ── 청약홈 분양 공고 수집 (PRESALE-01, per T-13-06) ──────────────────────────
  // fetchCheongyakList 내부에서 경남 전체 조회 후 regions 기반 동적 도시명으로 필터링
  const activeCityNames = await getActiveCityNames(supabase)
  const cheongyakPblancNos: string[] = []
  try {
    const items = await fetchCheongyakList(activeCityNames)
    for (const item of items) {
      const row = normalizeCheongyakItem(item)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
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
        cheongyakUpserted++
        cheongyakPblancNos.push(row.pblanc_no)
      } else {
        errors.push(`cheongyak upsert pblanc_no=${row.pblanc_no}: ${error.message}`)
      }
    }
  } catch (err) {
    errors.push(`cheongyak: ${err instanceof Error ? err.message : String(err)}`)
  }
  totalUpserted += cheongyakUpserted

  // ── 청약홈 잔여세대·무순위 수집 (PRESALE-01-B) ────────────────────────────────
  try {
    const remndrItems = await fetchRemndrList(activeCityNames)
    for (const item of remndrItems) {
      const row = normalizeRemndrItem(item)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
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
        remndrUpserted++
        cheongyakPblancNos.push(row.pblanc_no)
      } else {
        errors.push(`remndr upsert pblanc_no=${row.pblanc_no}: ${error.message}`)
      }
    }
  } catch (err) {
    errors.push(`remndr: ${err instanceof Error ? err.message : String(err)}`)
  }
  totalUpserted += remndrUpserted

  // ── 청약홈 경쟁률 병합 (PRESALE-02, per D-2) ─────────────────────────────────
  for (const pblancNo of cheongyakPblancNos) {
    try {
      const rate = await fetchCompetitionRate(pblancNo)
      if (rate == null) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('new_listings')
        .update({ competition_rate: rate })
        .eq('pblanc_no', pblancNo)
      if (!error) competitionUpdated++
      else errors.push(`competition update pblanc_no=${pblancNo}: ${error.message}`)
    } catch (err) {
      errors.push(`competition pblanc_no=${pblancNo}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── 청약홈 만료 공고 비활성화 (RESEARCH Pitfall 3, T-13-07) ──────────────────
  try {
    const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: expired, error } = await (supabase as any)
      .from('new_listings')
      .update({ is_active: false })
      .lt('rcept_endde', today)
      .not('pblanc_no', 'is', null)
      .eq('is_active', true)
      .select('id')
    if (!error) expiredDeactivated = (expired as { id: string }[] | null)?.length ?? 0
    else errors.push(`expired deactivation: ${error.message}`)
  } catch (err) {
    errors.push(`expired deactivation: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── 오피스텔 실거래 당월 수집 (OFFI-01) ──────────────────────────────────
  const offiYm = currentYearMonth()
  let offiErrors = 0
  for (const sggCode of activeSggCodes) {
    try {
      const result = await ingestOffiMonth(sggCode, offiYm, supabase)
      offiUpserted += result.rowsUpserted
      if (result.status === 'failed') {
        errors.push(`offi ${sggCode} ${offiYm}: ${result.rowsFailed}건 실패`)
        offiErrors++
      }
    } catch (err) {
      errors.push(`offi ${sggCode}: ${err instanceof Error ? err.message : String(err)}`)
      offiErrors++
    }
  }
  totalUpserted += offiUpserted
  const offiStatus = offiErrors === 0 ? 'success' : offiErrors < activeSggCodes.length ? 'partial' : 'failed'
  const offiErrMsg = offiErrors > 0
    ? errors.filter(e => e.startsWith('offi')).slice(-3).join('; ')
    : undefined
  await markCronStatus(supabase, 'molit_offi_trade', offiStatus, offiErrMsg)
    .catch(() => { /* molit_offi_trade 미등록이면 무시 */ })

  // ── Phase 11: 평당가·30일 변동률·거래량 배치 집계 (MAP-02, MAP-05) ──────────
  try {
    await supabase.rpc('refresh_complex_price_stats')
  } catch (err) {
    errors.push(`refresh_complex_price_stats: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── 갭투자 통계 재계산 (GAP-D05) ──────────────────────────────────────────
  try {
    const gapResult = await computeGapStats(supabase)
    gapUpdated = gapResult.complexesUpdated
    if (gapResult.errors.length > 0) {
      errors.push(...gapResult.errors)
      await markCronFailed(supabase, 'gap-stats').catch(() => {/* gap-stats source 미등록이면 무시 */})
    } else {
      await markCronSuccess(supabase, 'gap-stats').catch(() => {/* gap-stats source 미등록이면 무시 */})
    }
  } catch (err) {
    errors.push(`computeGapStats: ${err instanceof Error ? err.message : String(err)}`)
    await markCronFailed(supabase, 'gap-stats').catch(() => {/* gap-stats source 미등록이면 무시 */})
  }

  await markCronStatus(supabase, 'daily-batch', errors.length === 0 ? 'success' : 'partial')

  return Response.json({
    ok: errors.length === 0,
    totalUpserted,
    kaptUpserted,
    presaleUpserted,
    cheongyakUpserted,
    remndrUpserted,
    competitionUpdated,
    expiredDeactivated,
    offiUpserted,
    gapUpdated,
    errors,
  })
}
