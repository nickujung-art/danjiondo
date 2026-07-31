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

/** K-apt 1회 실행당 처리할 단지 수. 2,922건 ÷ 70 ≈ 42일 순환 (SLA 45일 충족) */
const KAPT_BATCH_SIZE = 70
/** K-apt 루프 시간 예산. 초과 시 중단하고 나머지는 다음 실행으로 넘긴다 */
const KAPT_TIME_BUDGET_MS = 60_000
/** PostgREST 기본 1,000행 캡을 넘기기 위한 페이지 크기 */
const PAGE_SIZE = 1000
/** 페이지네이션 상한 — 소스가 계속 가득 찬 페이지를 돌려줄 때 무한 루프 방지 */
const MAX_PAGES = 20

type KaptTarget = { id: string; kapt_code: string }

/**
 * PostgREST의 1,000행 캡을 넘어 전체 행을 가져온다.
 * (Phase 34에서 같은 캡에 걸린 전례가 있어 페이지네이션을 명시적으로 쓴다)
 *
 * `MAX_PAGES`로 상한을 둔다 — 대상 테이블이 수천 행 규모라 20페이지(2만 행)면
 * 충분하고, 소스가 계속 `PAGE_SIZE`를 돌려주는 이상 상황에서 루프가 멈추지 않는
 * 것을 막는다.
 */
async function fetchAllPages<T>(
  runPage: (from: number, to: number) => Promise<{ data: T[] | null }>,
): Promise<T[]> {
  const all: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data } = await runPage(from, from + PAGE_SIZE - 1)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return all
}

/**
 * 이번 실행에서 K-apt를 수집할 단지를 고른다.
 *
 * 우선순위: **facility_kapt가 없는 단지 → updated_at이 오래된 단지** 순.
 *
 * 이전 구현은 정렬·offset 없이 `.limit(50)`만 걸어 매일 같은 50개만 처리했고,
 * kapt_code 보유 2,922건 중 1,463건(50%)이 한 번도 수집되지 않았다.
 *
 * 일자 기반 offset 순환을 쓰지 않는 이유: 시간 예산으로 배치가 조기 종료되면
 * offset은 그대로 전진해 처리하지 못한 단지가 영구히 건너뛰어진다. 이 방식은
 * 처리 못 한 단지가 다음 실행에서도 여전히 우선순위 앞쪽에 남아 자기교정된다.
 */
async function selectKaptTargets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  limit: number,
): Promise<KaptTarget[]> {
  const eligible = await fetchAllPages<KaptTarget>((from, to) =>
    supabase
      .from('complexes')
      .select('id, kapt_code')
      .not('kapt_code', 'is', null)
      .order('id')
      .range(from, to),
  )

  const synced = await fetchAllPages<{ complex_id: string; updated_at: string | null }>((from, to) =>
    supabase
      .from('facility_kapt')
      .select('complex_id, updated_at')
      .order('complex_id')
      .range(from, to),
  )

  const syncedAt = new Map(synced.map(row => [row.complex_id, row.updated_at ?? '']))

  // 미수집(=Map에 없음)은 빈 문자열로 취급돼 오름차순 정렬에서 항상 앞에 온다
  return [...eligible]
    .filter(c => Boolean(c.kapt_code))
    .sort((a, b) => (syncedAt.get(a.id) ?? '').localeCompare(syncedAt.get(b.id) ?? ''))
    .slice(0, limit)
}

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createSupabaseAdminClient() as any
  const activeSggCodes = await getActiveSggCodes(supabase)

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
  if (!await markCronStatus(supabase, 'molit_offi_trade', offiStatus, offiErrMsg)) {
    errors.push('markCronStatus(molit_offi_trade) 갱신 실패 — 로그 확인')
  }

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
      if (!await markCronFailed(supabase, 'gap-stats')) {
        errors.push('markCronFailed(gap-stats) 갱신 실패 — 로그 확인')
      }
    } else if (!await markCronSuccess(supabase, 'gap-stats')) {
      errors.push('markCronSuccess(gap-stats) 갱신 실패 — 로그 확인')
    }
  } catch (err) {
    errors.push(`computeGapStats: ${err instanceof Error ? err.message : String(err)}`)
    if (!await markCronFailed(supabase, 'gap-stats')) {
      errors.push('markCronFailed(gap-stats) 갱신 실패 — 로그 확인')
    }
  }

  // ── K-apt 부대시설 UPSERT (DATA-01) ──────────────────────────────────────
  // 라우트 **마지막**에 둔다. K-apt는 SLA 45일짜리 시설 데이터로 우선순위가 가장
  // 낮은데 이전에는 맨 앞에서 돌았다 — 여기서 타임아웃이 나면 실거래·분양·청약·
  // 오피스텔·갭통계가 전부 실행되지 않았다.
  const kaptStart = Date.now()
  let kaptUpserted = 0
  let kaptErrors = 0
  let kaptBudgetExceeded = false
  const kaptTargets = await selectKaptTargets(supabase, KAPT_BATCH_SIZE)

  for (const complex of kaptTargets) {
    if (Date.now() - kaptStart > KAPT_TIME_BUDGET_MS) {
      kaptBudgetExceeded = true
      break
    }
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
        // 제약은 UNIQUE (complex_id, data_month) 다 — 월별 스냅샷 이력을 남기려는 의도된 설계.
        // 'complex_id' 만 주면 매칭되는 유니크 제약이 없어 upsert 가 **100% 실패**한다
        // (2026-07-30 프로덕션 로그: "there is no unique or exclusion constraint matching the
        //  ON CONFLICT specification" 50건 = 그날 .limit(50) 대상 수와 정확히 일치).
        // 실패가 조용해서 오래 묻혔다 — facility_kapt 최종 적재가 2026-07-06 에 멈춰 있었다.
        { onConflict: 'complex_id,data_month' },
      ) as { error: { message: string } | null }
      if (!error) kaptUpserted++
      else kaptErrors++
    } catch (err) {
      errors.push(`kapt=${complex.kapt_code}: ${err instanceof Error ? err.message : String(err)}`)
      kaptErrors++
    }
  }
  totalUpserted += kaptUpserted
  if (!await markCronStatus(supabase, 'kapt', kaptErrors === 0 ? 'success' : 'partial')) {
    errors.push('markCronStatus(kapt) 갱신 실패 — 로그 확인')
  }

  await markCronStatus(supabase, 'daily-batch', errors.length === 0 ? 'success' : 'partial')

  return Response.json({
    ok: errors.length === 0,
    totalUpserted,
    kaptUpserted,
    kaptSelected: kaptTargets.length,
    kaptBudgetExceeded,
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
