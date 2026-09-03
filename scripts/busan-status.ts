/**
 * 부산 복원 진행 실측 단일 진입점 (Phase 41)
 *
 * 이후 6개 plan(41-02~41-09)의 acceptance_criteria 가 전부 이 스크립트의 출력을 근거로
 * 삼는다 — 각 실행자가 같은 쿼리를 재발명하지 않도록 측정을 한곳에 모은다.
 *
 * 실행:
 *   npx tsx scripts/busan-status.ts                    # 사람이 읽는 표, 항상 exit 0
 *   npx tsx scripts/busan-status.ts --json              # 단일 JSON 객체, 항상 exit 0
 *   npx tsx scripts/busan-status.ts --assert-seed-gate  # 백필 진입 게이트. 미달 시 exit 1
 *   npx tsx scripts/busan-status.ts --assert-runs-purged # ingest_runs 부산 0행 아니면 exit 1
 *
 * 필요 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 🔴 anti-silent-success: 조회 실패(error)와 "0행"을 반드시 구분한다. Supabase 쿼리의 error 를
 * 절대 삼키지 않는다 — throw 해서 스크립트가 죽게 둔다. 0행을 정상 결과로 조용히 보고하면
 * 이 Phase 전체의 검증 근거가 무너진다(ADR-063).
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScriptSupabase = SupabaseClient<any, 'public', any>

// src/app/admin/region-expansion/page.tsx NEW_CODES 와 동일 집합.
const BUSAN_SGG_CODES = [
  '26110', '26140', '26170', '26200', '26230', '26260', '26290', '26320',
  '26350', '26380', '26410', '26440', '26470', '26500', '26530', '26710',
]

/** Pro 플랜 용량 한도(8GB). db_size 를 이 값 대비 % 로 환산한다. */
const PRO_LIMIT_MB = 8192

/** --assert-seed-gate 임계 — 근거는 scripts/busan-status.ts 를 만든 41-01-PLAN.md Task 3 참조.
 * K-apt 실측 시딩량 1,463(Phase 34) 대비 여유를 둔 값. ROADMAP 요구치(1,500)보다 낮다 —
 * K-apt 시딩만으로는 1,500 에 닿지 않을 가능성이 높다는 것이 41-CONTEXT.md D-09/Task 3 의 결론. */
const SEED_GATE_MIN_COMPLEXES = 1400
const SEED_GATE_MIN_COORD_COVERAGE_PCT = 95

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function warnIfLocal(url: string): void {
  console.log(`🔗 연결 대상: ${url}`)
  if (url.includes('127.0.0.1') || url.includes('localhost')) {
    console.warn('⚠️  로컬 Supabase에 연결 중입니다. 프로덕션 URL을 사용하려면 환경변수를 명시적으로 설정하세요.')
  }
}

interface Metrics {
  regions_busan_active: number
  regions_total_active: number
  complexes_busan_total: number
  complexes_coord_not_null: number
  complexes_coord_coverage_pct: number
  complexes_by_gu: Record<string, number>
  complexes_avg_sale_per_pyeong_not_null: number
  ingest_runs_busan_total: number
  ingest_runs_by_source: Record<string, Record<string, number>>
  ingest_runs_rows_upserted_sum: number
  transactions_busan_total: number
  transactions_complex_id_null: number
  /**
   * 부산 거래가 0건이면 `null` 이다 — **0을 100% 로 보고하지 않는다.**
   *
   * 이 프로젝트의 반복된 실패 모양이 "실패가 정상 응답의 모습으로 오는 것"이다(ADR-063).
   * 백필 그룹이 0건을 적재했을 때 연결률 100% 가 찍히면 그게 정확히 그 모양이 된다 —
   * 41-05~07 의 수용 기준이 이 값을 근거로 삼으므로 표본 없음과 완전 연결을 구분해야 한다.
   */
  transactions_linked_pct: number | null
  /**
   * 🔴 apt/villa 를 나눠 재야 한다 — 합산만 보면 잘못된 결론이 나온다.
   *
   * 실측(2026-08-20, 백필 중): 아파트 65.7% / 연립다세대 **0.6%**.
   * `complexes` 는 K-apt 기반 **아파트 단지** 마스터라 연립·다세대에 대응 단지가
   * 애초에 없다. 매칭 고장이 아니라 구조적 특성이다.
   *
   * villa 가 유입될수록 합산 연결률이 계속 내려가는데 그건 악화가 아니라 분모 변화다.
   * D-07 의 임계 65 는 **아파트 기준**으로 읽어야 한다.
   */
  transactions_apt_total: number
  transactions_apt_linked_pct: number | null
  transactions_villa_total: number
  transactions_villa_linked_pct: number | null
  transactions_deal_date_min: string | null
  transactions_deal_date_max: string | null
  complex_rankings_busan: number
  complex_gap_stats_busan: number
  complex_price_predictions_busan: number
  db_size_bytes: number | null
  db_size_mb: number | null
  db_size_pct_of_pro_8gb: number | null
  db_size_error: string | null
}

async function collectMetrics(
  supabase: ScriptSupabase,
): Promise<Metrics> {
  // ── regions ─────────────────────────────────────────────────────────────
  const { count: regionsBusanActive, error: eRegionsBusan } = await supabase
    .from('regions')
    .select('*', { count: 'exact', head: true })
    .in('sgg_code', BUSAN_SGG_CODES)
    .eq('is_active', true)
  if (eRegionsBusan) throw new Error(`regions(부산 활성) 조회 실패: ${eRegionsBusan.message}`)

  const { count: regionsTotalActive, error: eRegionsTotal } = await supabase
    .from('regions')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  if (eRegionsTotal) throw new Error(`regions(전체 활성) 조회 실패: ${eRegionsTotal.message}`)

  // ── complexes (좌표·구별 breakdown·avg_sale_per_pyeong 을 한 번에) ────────
  // 🔴 41-03 에서 발견: PostgREST 는 .select() 에 명시적 .range() 가 없으면 최대 1,000행만
  // 반환한다(기본 페이지 크기). 부산 시딩량이 1,467건으로 1,000을 넘어서면서 뒤쪽 구
  // (26440~26710)가 0으로 관측되는 조용한 절단이 실측으로 확인됐다 — .range() 페이지네이션으로
  // 전량을 끌어온다.
  type ComplexRow = { sgg_code: string; lat: number | null; avg_sale_per_pyeong: number | null }
  const complexRows: ComplexRow[] = []
  const PAGE_SIZE = 1000
  for (let page = 0; ; page++) {
    const { data: pageRows, error: eComplexes } = await supabase
      .from('complexes')
      .select('sgg_code, lat, avg_sale_per_pyeong')
      .in('sgg_code', BUSAN_SGG_CODES)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (eComplexes) throw new Error(`complexes(부산) 조회 실패: ${eComplexes.message}`)
    const rows = (pageRows ?? []) as ComplexRow[]
    complexRows.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  const complexesBusanTotal = complexRows.length
  const complexesCoordNotNull = complexRows.filter((r) => r.lat !== null).length
  const complexesAvgSaleNotNull = complexRows.filter((r) => r.avg_sale_per_pyeong !== null).length
  const complexesByGu: Record<string, number> = Object.fromEntries(
    BUSAN_SGG_CODES.map((code) => [code, 0]),
  )
  for (const r of complexRows) {
    if (r.sgg_code in complexesByGu) complexesByGu[r.sgg_code] = (complexesByGu[r.sgg_code] ?? 0) + 1
  }
  const complexesCoordCoveragePct =
    complexesBusanTotal > 0 ? (complexesCoordNotNull / complexesBusanTotal) * 100 : 0

  // ── ingest_runs (source_id × status 교차 집계 + rows_upserted 합계) ──────
  // 🔴 complexes 와 동일한 1,000행 캡이 여기에도 걸린다. 41-03 시점엔 부산 ingest_runs 가
  // 0행이라 재현되지 않았지만, 백필은 지역-월마다 1행을 쌓는다 — 그룹 A(5개 구 × 140개월 ×
  // apt/villa)만으로 1,400행이라 **첫 백필에서 바로 잘린다.**
  // rows_upserted 합계는 41-05~07 수용 기준의 근거이므로, 잘린 합계는 적재량을 과소보고해
  // "워크플로는 성공인데 숫자가 안 맞는다"는 오진을 만든다.
  type IngestRow = { source_id: string; status: string; rows_upserted: number | null }
  const ingestRows: IngestRow[] = []
  for (let page = 0; ; page++) {
    const { data: pageRows, error: eIngest } = await supabase
      .from('ingest_runs')
      .select('source_id, status, rows_upserted')
      .in('sgg_code', BUSAN_SGG_CODES)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (eIngest) throw new Error(`ingest_runs(부산) 조회 실패: ${eIngest.message}`)
    const rows = (pageRows ?? []) as IngestRow[]
    ingestRows.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }

  const ingestBySource: Record<string, Record<string, number>> = {}
  let ingestRowsUpsertedSum = 0
  for (const r of ingestRows) {
    ingestBySource[r.source_id] ??= {}
    const bucket = ingestBySource[r.source_id]!
    bucket[r.status] = (bucket[r.status] ?? 0) + 1
    ingestRowsUpsertedSum += r.rows_upserted ?? 0
  }

  // ── transactions (CLAUDE.md 규약: cancel_date IS NULL AND superseded_by IS NULL) ──
  function txBase() {
    return supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .in('sgg_code', BUSAN_SGG_CODES)
      .is('cancel_date', null)
      .is('superseded_by', null)
  }
  const [{ count: txTotal, error: eTxTotal }, { count: txUnlinked, error: eTxUnlinked }] =
    await Promise.all([txBase(), txBase().is('complex_id', null)])
  if (eTxTotal) throw new Error(`transactions(부산 총계) 조회 실패: ${eTxTotal.message}`)
  if (eTxUnlinked) throw new Error(`transactions(부산 미연결) 조회 실패: ${eTxUnlinked.message}`)

  const transactionsBusanTotal = txTotal ?? 0
  const transactionsComplexIdNull = txUnlinked ?? 0
  const transactionsLinkedPct =
    transactionsBusanTotal > 0
      ? ((transactionsBusanTotal - transactionsComplexIdNull) / transactionsBusanTotal) * 100
      : null

  // source_id 로 apt(molit_trade) / villa(molit_villa_trade) 를 갈라 잰다.
  // transactions 에는 건물 유형 컬럼이 없고 source_run_id → ingest_runs.source_id 가
  // 유일하게 정확한 출처다 (check-data-freshness.ts 의 embeddedFilter 와 같은 근거).
  async function bySource(sourceId: string): Promise<{ total: number; pct: number | null }> {
    const q = () =>
      supabase
        .from('transactions')
        .select('id, ingest_runs!inner(source_id)', { count: 'exact', head: true })
        .in('sgg_code', BUSAN_SGG_CODES)
        .is('cancel_date', null)
        .is('superseded_by', null)
        .eq('ingest_runs.source_id', sourceId)
    const [{ count: tot, error: e1 }, { count: nul, error: e2 }] = await Promise.all([
      q(),
      q().is('complex_id', null),
    ])
    if (e1) throw new Error(`transactions(${sourceId} 총계) 조회 실패: ${e1.message}`)
    if (e2) throw new Error(`transactions(${sourceId} 미연결) 조회 실패: ${e2.message}`)
    const total = tot ?? 0
    return { total, pct: total > 0 ? ((total - (nul ?? 0)) / total) * 100 : null }
  }
  const [aptStats, villaStats] = await Promise.all([
    bySource('molit_trade'),
    bySource('molit_villa_trade'),
  ])

  let transactionsDealDateMin: string | null = null
  let transactionsDealDateMax: string | null = null
  if (transactionsBusanTotal > 0) {
    const [{ data: minRow, error: eMin }, { data: maxRow, error: eMax }] = await Promise.all([
      supabase
        .from('transactions')
        .select('deal_date')
        .in('sgg_code', BUSAN_SGG_CODES)
        .is('cancel_date', null)
        .is('superseded_by', null)
        .order('deal_date', { ascending: true })
        .limit(1),
      supabase
        .from('transactions')
        .select('deal_date')
        .in('sgg_code', BUSAN_SGG_CODES)
        .is('cancel_date', null)
        .is('superseded_by', null)
        .order('deal_date', { ascending: false })
        .limit(1),
    ])
    if (eMin) throw new Error(`transactions(부산 deal_date min) 조회 실패: ${eMin.message}`)
    if (eMax) throw new Error(`transactions(부산 deal_date max) 조회 실패: ${eMax.message}`)
    transactionsDealDateMin = (minRow?.[0] as { deal_date: string } | undefined)?.deal_date ?? null
    transactionsDealDateMax = (maxRow?.[0] as { deal_date: string } | undefined)?.deal_date ?? null
  }

  // ── 파생값 3테이블 — complex_price_stats 라는 테이블은 없다.
  // 가격 파생값은 complexes 의 4개 컬럼(avg_sale_per_pyeong 등)이며 위에서 이미 집계했다.
  async function derivedBusanCount(table: string): Promise<number> {
    const { count, error } = await supabase
      .from(table)
      .select('id, complexes!inner(sgg_code)', { count: 'exact', head: true })
      .in('complexes.sgg_code', BUSAN_SGG_CODES)
    if (error) throw new Error(`${table}(부산) 조회 실패: ${error.message}`)
    return count ?? 0
  }
  const [complexRankingsBusan, complexGapStatsBusan, complexPricePredictionsBusan] =
    await Promise.all([
      derivedBusanCount('complex_rankings'),
      derivedBusanCount('complex_gap_stats'),
      derivedBusanCount('complex_price_predictions'),
    ])

  // ── db_size_bytes RPC — 마이그레이션 미적용이면 경고만 찍고 계속한다 ──────
  let dbSizeBytes: number | null = null
  let dbSizeMb: number | null = null
  let dbSizePct: number | null = null
  let dbSizeError: string | null = null
  const { data: dbSizeData, error: eDbSize } = await supabase.rpc('db_size_bytes')
  if (eDbSize) {
    dbSizeError = eDbSize.message
    console.warn(`⚠️  db_size_bytes() RPC 호출 실패(마이그레이션 미적용 가능성): ${eDbSize.message}`)
  } else {
    dbSizeBytes = Number(dbSizeData)
    dbSizeMb = dbSizeBytes / 1024 / 1024
    dbSizePct = (dbSizeMb / PRO_LIMIT_MB) * 100
  }

  return {
    regions_busan_active: regionsBusanActive ?? 0,
    regions_total_active: regionsTotalActive ?? 0,
    complexes_busan_total: complexesBusanTotal,
    complexes_coord_not_null: complexesCoordNotNull,
    complexes_coord_coverage_pct: complexesCoordCoveragePct,
    complexes_by_gu: complexesByGu,
    complexes_avg_sale_per_pyeong_not_null: complexesAvgSaleNotNull,
    ingest_runs_busan_total: ingestRows.length,
    ingest_runs_by_source: ingestBySource,
    ingest_runs_rows_upserted_sum: ingestRowsUpsertedSum,
    transactions_busan_total: transactionsBusanTotal,
    transactions_complex_id_null: transactionsComplexIdNull,
    transactions_linked_pct: transactionsLinkedPct,
    transactions_apt_total: aptStats.total,
    transactions_apt_linked_pct: aptStats.pct,
    transactions_villa_total: villaStats.total,
    transactions_villa_linked_pct: villaStats.pct,
    transactions_deal_date_min: transactionsDealDateMin,
    transactions_deal_date_max: transactionsDealDateMax,
    complex_rankings_busan: complexRankingsBusan,
    complex_gap_stats_busan: complexGapStatsBusan,
    complex_price_predictions_busan: complexPricePredictionsBusan,
    db_size_bytes: dbSizeBytes,
    db_size_mb: dbSizeMb,
    db_size_pct_of_pro_8gb: dbSizePct,
    db_size_error: dbSizeError,
  }
}

function printHumanReadable(m: Metrics): void {
  console.log('\n=== regions ===')
  console.log(`  부산 활성 ${m.regions_busan_active}/16, 전체 활성 ${m.regions_total_active}/38`)

  console.log('\n=== complexes ===')
  console.log(`  부산 총 ${m.complexes_busan_total.toLocaleString()} / 좌표 있음 ${m.complexes_coord_not_null.toLocaleString()} (${m.complexes_coord_coverage_pct.toFixed(1)}%)`)
  console.log(`  avg_sale_per_pyeong 있음 ${m.complexes_avg_sale_per_pyeong_not_null.toLocaleString()}`)
  console.log('  구별 breakdown:')
  for (const [code, count] of Object.entries(m.complexes_by_gu)) {
    console.log(`    ${code}: ${count.toLocaleString()}`)
  }

  console.log('\n=== ingest_runs ===')
  console.log(`  부산 총 ${m.ingest_runs_busan_total.toLocaleString()} / rows_upserted 합계 ${m.ingest_runs_rows_upserted_sum.toLocaleString()}`)
  for (const [sourceId, statuses] of Object.entries(m.ingest_runs_by_source)) {
    const parts = Object.entries(statuses).map(([status, n]) => `${status}=${n}`).join(' ')
    console.log(`    ${sourceId}: ${parts}`)
  }

  console.log('\n=== transactions ===')
  const linkedPctText =
    m.transactions_linked_pct === null
      ? '표본 없음 (거래 0건 — 연결률 판정 불가)'
      : `${m.transactions_linked_pct.toFixed(1)}%`
  console.log(`  부산 총 ${m.transactions_busan_total.toLocaleString()} / complex_id NULL ${m.transactions_complex_id_null.toLocaleString()} / 연결률 ${linkedPctText}`)
  const pctText = (v: number | null) => (v === null ? '표본 없음' : `${v.toFixed(1)}%`)
  console.log(`    ├ 아파트     ${m.transactions_apt_total.toLocaleString().padStart(9)} / 연결률 ${pctText(m.transactions_apt_linked_pct)}`)
  console.log(`    └ 연립다세대 ${m.transactions_villa_total.toLocaleString().padStart(9)} / 연결률 ${pctText(m.transactions_villa_linked_pct)}  (complexes 가 아파트 마스터라 구조적으로 낮다)`)
  console.log(`  deal_date ${m.transactions_deal_date_min ?? '-'} ~ ${m.transactions_deal_date_max ?? '-'}`)

  console.log('\n=== 파생값 ===')
  console.log(`  complex_rankings 부산 ${m.complex_rankings_busan.toLocaleString()}`)
  console.log(`  complex_gap_stats 부산 ${m.complex_gap_stats_busan.toLocaleString()}`)
  console.log(`  complex_price_predictions 부산 ${m.complex_price_predictions_busan.toLocaleString()}`)

  console.log('\n=== db_size ===')
  if (m.db_size_bytes !== null && m.db_size_mb !== null && m.db_size_pct_of_pro_8gb !== null) {
    console.log(`  ${m.db_size_mb.toFixed(1)}MB / ${PRO_LIMIT_MB}MB (${m.db_size_pct_of_pro_8gb.toFixed(1)}%)`)
  } else {
    console.log(`  측정 불가 — ${m.db_size_error}`)
  }
  console.log('')
}

function evaluateSeedGate(m: Metrics): string[] {
  const failures: string[] = []
  if (m.complexes_busan_total < SEED_GATE_MIN_COMPLEXES) {
    failures.push(
      `complexes 부산 ${m.complexes_busan_total} < ${SEED_GATE_MIN_COMPLEXES} — K-apt 시딩(seed-complexes.ts)이 아직 부족하거나 미실행`,
    )
  }
  if (m.complexes_coord_coverage_pct < SEED_GATE_MIN_COORD_COVERAGE_PCT) {
    failures.push(
      `좌표 커버리지 ${m.complexes_coord_coverage_pct.toFixed(1)}% < ${SEED_GATE_MIN_COORD_COVERAGE_PCT}% — geocode-complexes.ts 미실행 또는 부족`,
    )
  }
  const emptyGu = Object.entries(m.complexes_by_gu).filter(([, count]) => count < 1).map(([code]) => code)
  if (emptyGu.length > 0) {
    failures.push(`0개 단지인 구 ${emptyGu.length}곳: ${emptyGu.join(',')} — 이 구의 거래는 전량 미연결로 쌓인다`)
  }
  return failures
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')

  const jsonMode = hasFlag('json')
  if (!jsonMode) warnIfLocal(url)

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const metrics = await collectMetrics(supabase)

  if (jsonMode) {
    console.log(JSON.stringify(metrics))
  } else {
    printHumanReadable(metrics)
  }

  const failures: string[] = []

  if (hasFlag('assert-seed-gate')) {
    failures.push(...evaluateSeedGate(metrics))
  }

  if (hasFlag('assert-runs-purged')) {
    if (metrics.ingest_runs_busan_total !== 0) {
      failures.push(
        `ingest_runs 부산 ${metrics.ingest_runs_busan_total}행 — 0이어야 --resume 이 아무것도 skip 하지 않는다. 매칭 소스: ${JSON.stringify(metrics.ingest_runs_by_source)}`,
      )
    }
  }

  if (failures.length > 0) {
    console.error('\n❌ 게이트 미달:')
    for (const f of failures) console.error(`   - ${f}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`[busan-status] 검사 실패: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
