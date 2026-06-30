/**
 * 오피스텔 실거래가 ingest 로직
 * APT realprice.ts와 동일 패턴이나 두 가지 차이:
 *   1. aptSeq 없음 → dedupe_key에 'offi_' prefix + 주소 조합
 *   2. K-APT 미지원 → 매칭 실패 시 complexes에 자동 INSERT (building_type='officetel')
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchOffiSalePage,
  fetchOffiRentPage,
  OffiSaleItemSchema,
  OffiRentItemSchema,
  type OffiSaleItem,
  type OffiRentItem,
} from '@/services/molit-officetel'
import { nameNormalize } from './name-normalize'
import { upsertTransaction, type IngestResult } from './realprice'

// ── 지역코드 → 시·구 매핑 (창원·김해 한정) ──────────────────
const SGG_TO_ADDR: Record<string, { si: string; gu: string | null }> = {
  '48121': { si: '창원시', gu: '의창구' },
  '48123': { si: '창원시', gu: '성산구' },
  '48125': { si: '창원시', gu: '마산합포구' },
  '48127': { si: '창원시', gu: '마산회원구' },
  '48129': { si: '창원시', gu: '진해구' },
  '48250': { si: '김해시', gu: null },
}

// ── dedupe_key (APT와 충돌 방지: 'offi_' prefix) ──────────
function makeOffiDedupeKey(params: {
  sggCode:  string
  yearMonth: string
  offiNm:   string
  dealDate: string   // YYYYMMDD
  price:    number | null
  area:     number
}): string {
  const { sggCode, yearMonth, offiNm, dealDate, price, area } = params
  const pricePart = price ?? 'null'
  const areaPart  = area.toFixed(2)
  // offi_로 시작 → APT dedupe_key와 완전 분리
  return `offi_${sggCode}_${yearMonth}_${offiNm.trim()}_${dealDate}_${pricePart}_${areaPart}`
}

// ── 오피스텔 단지 자동 생성 ─────────────────────────────────
// K-APT 미지원 → 매칭 실패 시 complexes에 INSERT (building_type='officetel')
async function getOrCreateOffiComplex(
  supabase: SupabaseClient,
  offiNm: string,
  sggCd: string,
  umdNm?: string,
  buildYear?: number,
  cache: Map<string, string | null> = new Map(),
): Promise<string | null> {
  const nameNorm = nameNormalize(offiNm)
  const cacheKey = `${sggCd}:${nameNorm}:${umdNm ?? ''}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)!

  // 1단계: 기존 매칭 시도 (APT 포함 전체 complexes 대상)
  const { data: matchData } = await supabase.rpc('match_complex_by_admin', {
    p_sgg_code:        sggCd,
    p_name_normalized: nameNorm,
    p_min_similarity:  0.85,   // 오피스텔은 이름이 고유해 0.85로 충분
    p_umd_nm:          umdNm ?? null,
  })
  const match = (matchData as { id: string; trgm_sim: number }[] | null)?.[0]
  if (match && Number(match.trgm_sim) >= 0.85) {
    cache.set(cacheKey, match.id)
    return match.id
  }

  // 2단계: 매칭 실패 → 오피스텔 단지 자동 생성
  const addr = SGG_TO_ADDR[sggCd]
  const { data: newComplex, error } = await supabase
    .from('complexes')
    .insert({
      canonical_name:  offiNm,
      name_normalized: nameNorm,
      sgg_code:        sggCd,
      building_type:   'officetel',
      status:          'active',
      si:              addr?.si ?? null,
      gu:              addr?.gu ?? null,
      dong:            umdNm ?? null,
      built_year:      buildYear ?? null,
    })
    .select('id')
    .single()

  if (error) {
    // UNIQUE 위반(동시 삽입) → 재조회
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('complexes')
        .select('id')
        .eq('name_normalized', nameNorm)
        .eq('sgg_code', sggCd)
        .maybeSingle()
      const existingId = (existing as { id: string } | null)?.id ?? null
      cache.set(cacheKey, existingId)
      return existingId
    }
    cache.set(cacheKey, null)
    return null
  }

  const newId = (newComplex as { id: string }).id
  cache.set(cacheKey, newId)
  return newId
}

const ZOD_FAILURE_THRESHOLD = 0.05

// ── 단일 월 ingest (APT ingestMonth와 동일 인터페이스) ────────

export async function ingestOffiMonth(
  sggCode: string,
  yearMonth: string,
  supabase: SupabaseClient,
): Promise<IngestResult> {
  const { data: runRow, error: runErr } = await supabase
    .from('ingest_runs')
    .insert({ source_id: 'molit_offi_trade', sgg_code: sggCode, year_month: yearMonth, status: 'running' })
    .select('id')
    .single()
  if (runErr) throw new Error(`ingest_run 생성 실패: ${runErr.message}`)
  const runId = (runRow as { id: string }).id

  let rowsFetched  = 0
  let rowsUpserted = 0
  let rowsSkipped  = 0
  let rowsFailed   = 0
  let zodFails     = 0
  let totalRows    = 0

  // 단지 캐시 (ingestOffiMonth 호출 당 — 중복 INSERT 방지)
  const complexCache = new Map<string, string | null>()

  async function processSaleItem(raw: unknown): Promise<void> {
    totalRows++
    const parsed = OffiSaleItemSchema.safeParse(raw)
    if (!parsed.success) { zodFails++; rowsFailed++; return }

    try {
      const item: OffiSaleItem = parsed.data
      const price       = parseInt(item.dealAmount.replace(/,/g, ''), 10)
      const dealDate    = `${item.dealYear}-${String(item.dealMonth).padStart(2, '0')}-${String(item.dealDay).padStart(2, '0')}`
      const dealDateCmp = `${item.dealYear}${String(item.dealMonth).padStart(2, '0')}${String(item.dealDay).padStart(2, '0')}`
      const isCancelled = item.cdealType != null && item.cdealType.trim() !== ''
      const cancelDate  = isCancelled ? dealDate : null

      const complexId = await getOrCreateOffiComplex(
        supabase, item.offiNm, String(item.sggCd),
        item.umdNm, item.buildYear, complexCache,
      )

      const outcome = await upsertTransaction({
        deal_type:        'sale',
        deal_date:        dealDate,
        price:            isNaN(price) ? null : price,
        area_m2:          item.excluUseAr,
        floor:            item.floor,
        sgg_code:         String(item.sggCd),
        raw_complex_name: item.offiNm,
        raw_region_code:  sggCode,
        umd_nm:           item.umdNm ?? null,
        cancel_date:      cancelDate,
        source_run_id:    runId,
        complex_id:       complexId,
        dedupe_key:       makeOffiDedupeKey({
          sggCode,
          yearMonth,
          offiNm:   item.offiNm,
          dealDate: dealDateCmp,
          price:    isNaN(price) ? null : price,
          area:     item.excluUseAr,
        }),
      }, supabase)

      if (outcome === 'inserted') rowsUpserted++
      else rowsSkipped++
    } catch { rowsFailed++ }
  }

  async function processRentItem(raw: unknown): Promise<void> {
    totalRows++
    const parsed = OffiRentItemSchema.safeParse(raw)
    if (!parsed.success) { zodFails++; rowsFailed++; return }

    try {
      const item: OffiRentItem = parsed.data
      const deposit  = parseInt(item.deposit.replace(/,/g, ''), 10)
      const rent     = item.monthlyRent ?? 0
      const dealType: 'jeonse' | 'monthly' = rent > 0 ? 'monthly' : 'jeonse'
      const dealDate    = `${item.dealYear}-${String(item.dealMonth).padStart(2, '0')}-${String(item.dealDay).padStart(2, '0')}`
      const dealDateCmp = `${item.dealYear}${String(item.dealMonth).padStart(2, '0')}${String(item.dealDay).padStart(2, '0')}`

      const complexId = await getOrCreateOffiComplex(
        supabase, item.offiNm, String(item.sggCd),
        item.umdNm, item.buildYear, complexCache,
      )

      const outcome = await upsertTransaction({
        deal_type:        dealType,
        deal_date:        dealDate,
        price:            isNaN(deposit) ? null : deposit,
        monthly_rent:     rent > 0 ? rent : null,
        area_m2:          item.excluUseAr,
        floor:            item.floor,
        sgg_code:         String(item.sggCd),
        raw_complex_name: item.offiNm,
        raw_region_code:  sggCode,
        umd_nm:           item.umdNm ?? null,
        source_run_id:    runId,
        complex_id:       complexId,
        dedupe_key:       makeOffiDedupeKey({
          sggCode,
          yearMonth,
          offiNm:   item.offiNm,
          dealDate: dealDateCmp,
          price:    isNaN(deposit) ? null : deposit,
          area:     item.excluUseAr,
        }),
      }, supabase)

      if (outcome === 'inserted') rowsUpserted++
      else rowsSkipped++
    } catch { rowsFailed++ }
  }

  let finalStatus: 'success' | 'partial' | 'failed' = 'success'
  let finalErrorMessage: string | null = null

  try {
    // 매매 수집
    let page = 1
    while (true) {
      const { items, totalCount } = await fetchOffiSalePage(sggCode, yearMonth, page)
      if (items.length === 0) break
      rowsFetched += items.length
      for (const item of items) await processSaleItem(item)
      if (rowsFetched >= totalCount || items.length < 100) break
      page++
    }

    // 전월세 수집
    page = 1
    let rentFetched = 0
    while (true) {
      const { items, totalCount } = await fetchOffiRentPage(sggCode, yearMonth, page)
      if (items.length === 0) break
      rowsFetched  += items.length
      rentFetched  += items.length
      for (const item of items) await processRentItem(item)
      if (rentFetched >= totalCount || items.length < 100) break
      page++
    }

    const zodFailRate = totalRows > 0 ? zodFails / totalRows : 0
    const hasCriticalFailure = zodFailRate > ZOD_FAILURE_THRESHOLD
    finalStatus = hasCriticalFailure ? 'failed' : rowsFailed > 0 ? 'partial' : 'success'
    finalErrorMessage = hasCriticalFailure
      ? `zod 실패율 ${(zodFailRate * 100).toFixed(1)}% (임계 ${ZOD_FAILURE_THRESHOLD * 100}% 초과)`
      : null
  } catch (err) {
    finalStatus = 'failed'
    finalErrorMessage = err instanceof Error ? err.message : String(err)
    rowsFailed++
  } finally {
    await supabase.from('ingest_runs').update({
      status:        finalStatus,
      rows_fetched:  rowsFetched,
      rows_upserted: rowsUpserted,
      error_message: finalErrorMessage,
      completed_at:  new Date().toISOString(),
    }).eq('id', runId)
  }

  return { runId, sggCode, yearMonth, rowsFetched, rowsUpserted, rowsSkipped, rowsFailed, status: finalStatus }
}
