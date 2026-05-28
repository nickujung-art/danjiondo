import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchSalePage,
  fetchRentPage,
  MolitSaleItemSchema,
  MolitRentItemSchema,
  type MolitSaleItem,
  type MolitRentItem,
  fetchVillaSalePage,
  fetchVillaRentPage,
  MolitVillaSaleItemSchema,
  MolitVillaRentItemSchema,
  type MolitVillaSaleItem,
  type MolitVillaRentItem,
} from '@/services/molit'
import { nameNormalize } from './name-normalize'

// ── dedupe_key ─────────────────────────────────────────────
// aptSeq("48121-792") 가 있으면 이름보다 안정적이므로 우선 사용

export function makeDedupeKey(params: {
  sggCode: string
  yearMonth: string    // YYYYMM
  complexName: string
  aptSeq?: string      // "48121-792" 형식 단지코드 (있으면 우선)
  dealDate: string     // YYYYMMDD
  price: number | null
  area: number
}): string {
  const { sggCode, yearMonth, complexName, aptSeq, dealDate, price, area } = params
  const complexPart = aptSeq ?? complexName.trim()
  const pricePart   = price ?? 'null'
  const areaPart    = area.toFixed(2)
  return `${sggCode}_${yearMonth}_${complexPart}_${dealDate}_${pricePart}_${areaPart}`
}

// ── 단일 거래 upsert ───────────────────────────────────────

interface TransactionInsert {
  deal_type:        'sale' | 'jeonse' | 'monthly'
  deal_date:        string
  price:            number | null
  monthly_rent?:    number | null
  area_m2:          number
  floor:            number | null
  sgg_code:         string
  raw_complex_name: string
  raw_region_code?: string
  umd_nm?:          string | null
  jibun?:           string | null
  cancel_date?:     string | null
  source_run_id?:   string
  dedupe_key:       string
  complex_id?:      string | null
  building_name?:   string | null
}

export async function upsertTransaction(
  row: TransactionInsert,
  supabase: SupabaseClient,
): Promise<'inserted' | 'skipped'> {
  const { data, error } = await supabase
    .from('transactions')
    .upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: false })
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`upsertTransaction failed: ${error.message}`)
  return data ? 'inserted' : 'skipped'
}

// ── IngestResult ───────────────────────────────────────────

export interface IngestResult {
  runId: string
  sggCode: string
  yearMonth: string
  rowsFetched: number
  rowsUpserted: number
  rowsSkipped: number
  rowsFailed: number
  status: 'success' | 'partial' | 'failed'
}

const ZOD_FAILURE_THRESHOLD = 0.05

// ── 단일 월 ingest ─────────────────────────────────────────

export async function ingestMonth(
  sggCode: string,
  yearMonth: string,
  supabase: SupabaseClient,
): Promise<IngestResult> {
  const { data: runRow, error: runErr } = await supabase
    .from('ingest_runs')
    .insert({ source_id: 'molit_trade', sgg_code: sggCode, year_month: yearMonth, status: 'running' })
    .select('id')
    .single()
  if (runErr) throw new Error(`ingest_run 생성 실패: ${runErr.message}`)
  const runId = (runRow as { id: string }).id

  let rowsFetched = 0
  let rowsUpserted = 0
  let rowsSkipped = 0
  let rowsFailed = 0
  let zodFails = 0
  let totalRows = 0

  // DATA-10: complex_id 캐시 (ingestMonth 호출 당 — 중복 RPC 방지, Pitfall 5)
  // 모듈 스코프 금지 — 호출 간 캐시 오염 방지를 위해 함수 스코프에 정의
  const complexIdCache = new Map<string, string | null>()

  async function lookupComplexIdCached(
    itemSggCode: string,
    nameNormalized: string,
    umdNm?: string,
  ): Promise<string | null> {
    const key = `${itemSggCode}:${nameNormalized}:${umdNm ?? ''}`
    if (complexIdCache.has(key)) return complexIdCache.get(key)!
    const { data, error } = await supabase.rpc('match_complex_by_admin', {
      p_sgg_code:        itemSggCode,
      p_name_normalized: nameNormalized,
      p_min_similarity:  0.9,  // 자동 연결은 고신뢰만 (DATA-10, T-07-03-02)
      p_umd_nm:          umdNm ?? null,
    })
    if (error || !data || (data as unknown[]).length === 0) {
      complexIdCache.set(key, null)
      return null
    }
    const row = (data as { id: string; trgm_sim: number }[])[0]!
    const complexId = Number(row.trgm_sim) >= 0.9 ? row.id : null
    complexIdCache.set(key, complexId)
    return complexId
  }

  async function processSaleItem(raw: unknown): Promise<void> {
    totalRows++
    const parsed = MolitSaleItemSchema.safeParse(raw)
    if (!parsed.success) { zodFails++; rowsFailed++; return }

    try {
      const item: MolitSaleItem = parsed.data
      const price = parseInt(item.dealAmount.replace(/,/g, ''), 10)
      const dealDate = `${item.dealYear}-${String(item.dealMonth).padStart(2, '0')}-${String(item.dealDay).padStart(2, '0')}`
      const dealDateCompact = `${item.dealYear}${String(item.dealMonth).padStart(2, '0')}${String(item.dealDay).padStart(2, '0')}`
      const isCancelled = item.cdealType != null && item.cdealType.trim() !== ''
      const cancelDate = isCancelled ? dealDate : null

      // DATA-10: complex_id 자동 연결 (umdNm 동 필터로 정밀 매칭)
      const nameNorm = nameNormalize(item.aptNm)
      const complexId = await lookupComplexIdCached(String(item.sggCd), nameNorm, item.umdNm)

      // molit_complex_code 저장: aptSeq 있고 매칭 성공 시 1회만 (T-07-03-01)
      if (item.aptSeq && complexId) {
        await supabase
          .from('complexes')
          .update({ molit_complex_code: item.aptSeq })
          .eq('id', complexId)
          .is('molit_complex_code', null)  // 이미 설정된 경우 덮어쓰기 금지
      }

      const outcome = await upsertTransaction({
        deal_type:        'sale',
        deal_date:        dealDate,
        price:            isNaN(price) ? null : price,
        area_m2:          item.excluUseAr,
        floor:            item.floor,
        sgg_code:         String(item.sggCd),
        raw_complex_name: item.aptNm,
        raw_region_code:  sggCode,
        umd_nm:           item.umdNm ?? null,
        jibun:            item.jibun?.trim() || null,
        cancel_date:      cancelDate,
        source_run_id:    runId,
        complex_id:       complexId ?? null,  // DATA-10 추가
        dedupe_key:       makeDedupeKey({
          sggCode,
          yearMonth,
          complexName: item.aptNm,
          aptSeq:      item.aptSeq,
          dealDate:    dealDateCompact,
          price:       isNaN(price) ? null : price,
          area:        item.excluUseAr,
        }),
      }, supabase)

      if (outcome === 'inserted') rowsUpserted++
      else rowsSkipped++
    } catch { rowsFailed++ }
  }

  async function processRentItem(raw: unknown): Promise<void> {
    totalRows++
    const parsed = MolitRentItemSchema.safeParse(raw)
    if (!parsed.success) { zodFails++; rowsFailed++; return }

    try {
      const item: MolitRentItem = parsed.data
      const deposit = parseInt(item.deposit.replace(/,/g, ''), 10)
      const rent = item.monthlyRent ?? 0
      const dealType: 'jeonse' | 'monthly' = rent > 0 ? 'monthly' : 'jeonse'
      const dealDate = `${item.dealYear}-${String(item.dealMonth).padStart(2, '0')}-${String(item.dealDay).padStart(2, '0')}`
      const dealDateCompact = `${item.dealYear}${String(item.dealMonth).padStart(2, '0')}${String(item.dealDay).padStart(2, '0')}`

      // DATA-10: complex_id 자동 연결 (전월세 — aptSeq 없으므로 molit_complex_code 업데이트 불필요)
      const nameNorm = nameNormalize(item.aptNm)
      const complexId = await lookupComplexIdCached(String(item.sggCd), nameNorm, item.umdNm)

      const outcome = await upsertTransaction({
        deal_type:        dealType,
        deal_date:        dealDate,
        price:            isNaN(deposit) ? null : deposit,
        monthly_rent:     rent > 0 ? rent : null,
        area_m2:          item.excluUseAr,
        floor:            item.floor,
        sgg_code:         String(item.sggCd),
        raw_complex_name: item.aptNm,
        raw_region_code:  sggCode,
        umd_nm:           item.umdNm ?? null,
        jibun:            item.jibun?.trim() || null,
        source_run_id:    runId,
        complex_id:       complexId ?? null,  // DATA-10 추가
        dedupe_key:       makeDedupeKey({
          sggCode,
          yearMonth,
          complexName: item.aptNm,
          aptSeq:      item.aptSeq,
          dealDate:    dealDateCompact,
          price:       isNaN(deposit) ? null : deposit,
          area:        item.excluUseAr,
        }),
      }, supabase)

      if (outcome === 'inserted') rowsUpserted++
      else rowsSkipped++
    } catch { rowsFailed++ }
  }

  // 매매 수집
  let page = 1
  while (true) {
    const { items, totalCount } = await fetchSalePage(sggCode, yearMonth, page)
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
    const { items, totalCount } = await fetchRentPage(sggCode, yearMonth, page)
    if (items.length === 0) break
    rowsFetched += items.length
    rentFetched += items.length
    for (const item of items) await processRentItem(item)
    if (rentFetched >= totalCount || items.length < 100) break
    page++
  }

  // zod 실패율 > 5% → 배치 중단 (ADR-053)
  const zodFailRate = totalRows > 0 ? zodFails / totalRows : 0
  const hasCriticalFailure = zodFailRate > ZOD_FAILURE_THRESHOLD

  const status = hasCriticalFailure ? 'failed' : rowsFailed > 0 ? 'partial' : 'success'
  const errorMessage = hasCriticalFailure
    ? `zod 실패율 ${(zodFailRate * 100).toFixed(1)}% (임계 ${ZOD_FAILURE_THRESHOLD * 100}% 초과)`
    : null

  await supabase.from('ingest_runs').update({
    status,
    rows_fetched:  rowsFetched,
    rows_upserted: rowsUpserted,
    error_message: errorMessage,
    completed_at:  new Date().toISOString(),
  }).eq('id', runId)

  return { runId, sggCode, yearMonth, rowsFetched, rowsUpserted, rowsSkipped, rowsFailed, status }
}

// ── 연립다세대 단일 월 ingest ──────────────────────────────

export async function ingestMonthVilla(
  sggCode: string,
  yearMonth: string,
  supabase: SupabaseClient,
): Promise<IngestResult> {
  const { data: runRow, error: runErr } = await supabase
    .from('ingest_runs')
    .insert({ source_id: 'molit_villa_trade', sgg_code: sggCode, year_month: yearMonth, status: 'running' })
    .select('id')
    .single()
  if (runErr) throw new Error(`ingest_run 생성 실패 (villa): ${runErr.message}`)
  const runId = (runRow as { id: string }).id

  let rowsFetched = 0
  let rowsUpserted = 0
  let rowsSkipped = 0
  let rowsFailed = 0
  let zodFails = 0
  let totalRows = 0

  // complex_id 캐시 (ingestMonthVilla 호출 당 — 중복 RPC 방지)
  const complexIdCache = new Map<string, string | null>()

  async function lookupComplexIdCached(
    itemSggCode: string,
    nameNormalized: string,
    umdNm?: string,
  ): Promise<string | null> {
    const key = `${itemSggCode}:${nameNormalized}:${umdNm ?? ''}`
    if (complexIdCache.has(key)) return complexIdCache.get(key)!
    const { data, error } = await supabase.rpc('match_complex_by_admin', {
      p_sgg_code:        itemSggCode,
      p_name_normalized: nameNormalized,
      p_min_similarity:  0.9,
      p_umd_nm:          umdNm ?? null,
    })
    if (error || !data || (data as unknown[]).length === 0) {
      complexIdCache.set(key, null)
      return null
    }
    const row = (data as { id: string; trgm_sim: number }[])[0]!
    const complexId = Number(row.trgm_sim) >= 0.9 ? row.id : null
    complexIdCache.set(key, complexId)
    return complexId
  }

  async function processVillaSaleItem(raw: unknown): Promise<void> {
    totalRows++
    const parsed = MolitVillaSaleItemSchema.safeParse(raw)
    if (!parsed.success) { zodFails++; rowsFailed++; return }

    try {
      const item: MolitVillaSaleItem = parsed.data
      const price = parseInt(item.dealAmount.replace(/,/g, ''), 10)
      const dealDate = `${item.dealYear}-${String(item.dealMonth).padStart(2, '0')}-${String(item.dealDay).padStart(2, '0')}`
      const dealDateCompact = `${item.dealYear}${String(item.dealMonth).padStart(2, '0')}${String(item.dealDay).padStart(2, '0')}`
      const isCancelled = item.cdealType != null && item.cdealType.trim() !== ''
      const cancelDate = isCancelled ? dealDate : null

      const nameNorm = nameNormalize(item.mhouseNm)
      const complexId = await lookupComplexIdCached(String(item.sggCd), nameNorm, item.umdNm)

      // 연립다세대는 aptSeq 없으므로 molit_complex_code 업데이트 없음

      const outcome = await upsertTransaction({
        deal_type:        'sale',
        deal_date:        dealDate,
        price:            isNaN(price) ? null : price,
        area_m2:          item.excluUseAr,
        floor:            item.floor,
        sgg_code:         String(item.sggCd),
        raw_complex_name: item.mhouseNm,
        raw_region_code:  sggCode,
        umd_nm:           item.umdNm ?? null,
        jibun:            item.jibun?.trim() || null,
        cancel_date:      cancelDate,
        source_run_id:    runId,
        complex_id:       complexId ?? null,
        dedupe_key:       makeDedupeKey({
          sggCode,
          yearMonth,
          complexName: item.mhouseNm,
          dealDate:    dealDateCompact,
          price:       isNaN(price) ? null : price,
          area:        item.excluUseAr,
        }),
      }, supabase)

      if (outcome === 'inserted') rowsUpserted++
      else rowsSkipped++
    } catch { rowsFailed++ }
  }

  async function processVillaRentItem(raw: unknown): Promise<void> {
    totalRows++
    const parsed = MolitVillaRentItemSchema.safeParse(raw)
    if (!parsed.success) { zodFails++; rowsFailed++; return }

    try {
      const item: MolitVillaRentItem = parsed.data
      const deposit = parseInt(item.deposit.replace(/,/g, ''), 10)
      const rent = item.monthlyRent ?? 0
      const dealType: 'jeonse' | 'monthly' = rent > 0 ? 'monthly' : 'jeonse'
      const dealDate = `${item.dealYear}-${String(item.dealMonth).padStart(2, '0')}-${String(item.dealDay).padStart(2, '0')}`
      const dealDateCompact = `${item.dealYear}${String(item.dealMonth).padStart(2, '0')}${String(item.dealDay).padStart(2, '0')}`

      const nameNorm = nameNormalize(item.mhouseNm)
      const complexId = await lookupComplexIdCached(String(item.sggCd), nameNorm, item.umdNm)

      const outcome = await upsertTransaction({
        deal_type:        dealType,
        deal_date:        dealDate,
        price:            isNaN(deposit) ? null : deposit,
        monthly_rent:     rent > 0 ? rent : null,
        area_m2:          item.excluUseAr,
        floor:            item.floor,
        sgg_code:         String(item.sggCd),
        raw_complex_name: item.mhouseNm,
        raw_region_code:  sggCode,
        umd_nm:           item.umdNm ?? null,
        jibun:            item.jibun?.trim() || null,
        source_run_id:    runId,
        complex_id:       complexId ?? null,
        dedupe_key:       makeDedupeKey({
          sggCode,
          yearMonth,
          complexName: item.mhouseNm,
          dealDate:    dealDateCompact,
          price:       isNaN(deposit) ? null : deposit,
          area:        item.excluUseAr,
        }),
      }, supabase)

      if (outcome === 'inserted') rowsUpserted++
      else rowsSkipped++
    } catch { rowsFailed++ }
  }

  // 연립다세대 매매 수집
  let page = 1
  while (true) {
    const { items, totalCount } = await fetchVillaSalePage(sggCode, yearMonth, page)
    if (items.length === 0) break
    rowsFetched += items.length
    for (const item of items) await processVillaSaleItem(item)
    if (rowsFetched >= totalCount || items.length < 100) break
    page++
  }

  // 연립다세대 전월세 수집
  page = 1
  let rentFetched = 0
  while (true) {
    const { items, totalCount } = await fetchVillaRentPage(sggCode, yearMonth, page)
    if (items.length === 0) break
    rowsFetched += items.length
    rentFetched += items.length
    for (const item of items) await processVillaRentItem(item)
    if (rentFetched >= totalCount || items.length < 100) break
    page++
  }

  // zod 실패율 > 5% → 배치 중단 (ADR-053)
  const zodFailRate = totalRows > 0 ? zodFails / totalRows : 0
  const hasCriticalFailure = zodFailRate > ZOD_FAILURE_THRESHOLD

  const status = hasCriticalFailure ? 'failed' : rowsFailed > 0 ? 'partial' : 'success'
  const errorMessage = hasCriticalFailure
    ? `zod 실패율 ${(zodFailRate * 100).toFixed(1)}% (임계 ${ZOD_FAILURE_THRESHOLD * 100}% 초과)`
    : null

  await supabase.from('ingest_runs').update({
    status,
    rows_fetched:  rowsFetched,
    rows_upserted: rowsUpserted,
    error_message: errorMessage,
    completed_at:  new Date().toISOString(),
  }).eq('id', runId)

  return { runId, sggCode, yearMonth, rowsFetched, rowsUpserted, rowsSkipped, rowsFailed, status }
}
