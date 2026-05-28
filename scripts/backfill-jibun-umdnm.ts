/**
 * umd_nm=null 구형 거래에 jibun / umd_nm 역주입
 *
 * API를 재호출해 dedupe_key로 기존 row를 정확히 매칭한 뒤
 * jibun, umd_nm 두 필드만 업데이트한다.
 * 업데이트 후 link-transactions.ts를 실행하면 complex_id 재매칭 가능.
 *
 * 실행:
 *   npx tsx --env-file=.env.local scripts/backfill-jibun-umdnm.ts
 *   npx tsx --env-file=.env.local scripts/backfill-jibun-umdnm.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-jibun-umdnm.ts --sgg=48123
 *   npx tsx --env-file=.env.local scripts/backfill-jibun-umdnm.ts --sgg=48123,48121
 *
 * 환경변수: MOLIT_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import {
  fetchSalePage,
  fetchRentPage,
  fetchVillaSalePage,
  fetchVillaRentPage,
  MolitSaleItemSchema,
  MolitRentItemSchema,
  MolitVillaSaleItemSchema,
  MolitVillaRentItemSchema,
} from '../src/services/molit'
import { makeDedupeKey } from '../src/lib/data/realprice'

loadEnvConfig(process.cwd(), true)

if (!process.env.MOLIT_API_KEY)              { console.error('❌ MOLIT_API_KEY 없음');               process.exit(1) }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL)   { console.error('❌ NEXT_PUBLIC_SUPABASE_URL 없음');    process.exit(1) }
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)  { console.error('❌ SUPABASE_SERVICE_ROLE_KEY 없음');   process.exit(1) }

const args    = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const sggArg  = args.find(a => a.startsWith('--sgg='))?.split('=')[1]

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// ── 업데이트 함수 ──────────────────────────────────────────

async function updateRow(
  dedupeKey: string,
  jibun: string | null,
  umdNm: string | null,
): Promise<boolean> {
  if (DRY_RUN) return true
  const update: Record<string, string | null> = {}
  if (jibun)  update.jibun  = jibun
  if (umdNm)  update.umd_nm = umdNm
  if (Object.keys(update).length === 0) return false

  const { error } = await supabase
    .from('transactions')
    .update(update)
    .eq('dedupe_key', dedupeKey)
    .is('umd_nm', null)  // 이미 umd_nm 있는 건 덮어쓰지 않음
  return !error
}

// ── (sgg_code, ym) 조합별 처리 ────────────────────────────

async function processYearMonth(
  sggCode: string,
  ym: string,
  stats: { updated: number; noInfo: number; apiCalls: number },
): Promise<void> {
  // 아파트 매매
  let page = 1
  while (true) {
    const { items, totalCount } = await fetchSalePage(sggCode, ym, page)
    stats.apiCalls++
    if (items.length === 0) break
    for (const raw of items) {
      const parsed = MolitSaleItemSchema.safeParse(raw)
      if (!parsed.success) continue
      const item = parsed.data
      const jibun = item.jibun?.trim() || null
      const umdNm = item.umdNm?.trim() || null
      if (!jibun && !umdNm) { stats.noInfo++; continue }

      const price = parseInt(item.dealAmount.replace(/,/g, ''), 10)
      const dealDateCompact = `${item.dealYear}${String(item.dealMonth).padStart(2, '0')}${String(item.dealDay).padStart(2, '0')}`
      const key = makeDedupeKey({
        sggCode,
        yearMonth: ym,
        complexName: item.aptNm,
        aptSeq: item.aptSeq,
        dealDate: dealDateCompact,
        price: isNaN(price) ? null : price,
        area: item.excluUseAr,
      })
      if (await updateRow(key, jibun, umdNm)) stats.updated++
    }
    if (items.length < 100 || (page * 100) >= totalCount) break
    page++
    await new Promise(r => setTimeout(r, 100))
  }

  // 아파트 전월세
  page = 1
  while (true) {
    const { items, totalCount } = await fetchRentPage(sggCode, ym, page)
    stats.apiCalls++
    if (items.length === 0) break
    for (const raw of items) {
      const parsed = MolitRentItemSchema.safeParse(raw)
      if (!parsed.success) continue
      const item = parsed.data
      const jibun = item.jibun?.trim() || null
      const umdNm = item.umdNm?.trim() || null
      if (!jibun && !umdNm) { stats.noInfo++; continue }

      const deposit = parseInt(item.deposit.replace(/,/g, ''), 10)
      const dealDateCompact = `${item.dealYear}${String(item.dealMonth).padStart(2, '0')}${String(item.dealDay).padStart(2, '0')}`
      const key = makeDedupeKey({
        sggCode,
        yearMonth: ym,
        complexName: item.aptNm,
        aptSeq: item.aptSeq,
        dealDate: dealDateCompact,
        price: isNaN(deposit) ? null : deposit,
        area: item.excluUseAr,
      })
      if (await updateRow(key, jibun, umdNm)) stats.updated++
    }
    if (items.length < 100 || (page * 100) >= totalCount) break
    page++
    await new Promise(r => setTimeout(r, 100))
  }

  // 연립다세대 매매
  page = 1
  while (true) {
    const { items, totalCount } = await fetchVillaSalePage(sggCode, ym, page)
    stats.apiCalls++
    if (items.length === 0) break
    for (const raw of items) {
      const parsed = MolitVillaSaleItemSchema.safeParse(raw)
      if (!parsed.success) continue
      const item = parsed.data
      const jibun = item.jibun?.trim() || null
      const umdNm = item.umdNm?.trim() || null
      if (!jibun && !umdNm) { stats.noInfo++; continue }

      const price = parseInt(item.dealAmount.replace(/,/g, ''), 10)
      const dealDateCompact = `${item.dealYear}${String(item.dealMonth).padStart(2, '0')}${String(item.dealDay).padStart(2, '0')}`
      const key = makeDedupeKey({
        sggCode,
        yearMonth: ym,
        complexName: item.mhouseNm,
        dealDate: dealDateCompact,
        price: isNaN(price) ? null : price,
        area: item.excluUseAr,
      })
      if (await updateRow(key, jibun, umdNm)) stats.updated++
    }
    if (items.length < 100 || (page * 100) >= totalCount) break
    page++
    await new Promise(r => setTimeout(r, 100))
  }

  // 연립다세대 전월세
  page = 1
  while (true) {
    const { items, totalCount } = await fetchVillaRentPage(sggCode, ym, page)
    stats.apiCalls++
    if (items.length === 0) break
    for (const raw of items) {
      const parsed = MolitVillaRentItemSchema.safeParse(raw)
      if (!parsed.success) continue
      const item = parsed.data
      const jibun = item.jibun?.trim() || null
      const umdNm = item.umdNm?.trim() || null
      if (!jibun && !umdNm) { stats.noInfo++; continue }

      const deposit = parseInt(item.deposit.replace(/,/g, ''), 10)
      const dealDateCompact = `${item.dealYear}${String(item.dealMonth).padStart(2, '0')}${String(item.dealDay).padStart(2, '0')}`
      const key = makeDedupeKey({
        sggCode,
        yearMonth: ym,
        complexName: item.mhouseNm,
        dealDate: dealDateCompact,
        price: isNaN(deposit) ? null : deposit,
        area: item.excluUseAr,
      })
      if (await updateRow(key, jibun, umdNm)) stats.updated++
    }
    if (items.length < 100 || (page * 100) >= totalCount) break
    page++
    await new Promise(r => setTimeout(r, 100))
  }
}

// ── 날짜 범위 생성 ─────────────────────────────────────────

function monthRange(from: string, to: string): string[] {
  const months: string[] = []
  let [y, m] = [parseInt(from.slice(0, 4), 10), parseInt(from.slice(4, 6), 10)]
  const [ey, em] = [parseInt(to.slice(0, 4), 10), parseInt(to.slice(4, 6), 10)]
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return months
}

// ── 메인 ──────────────────────────────────────────────────

async function main() {
  console.log(`🔄 jibun/umd_nm 역주입 시작${DRY_RUN ? ' [DRY-RUN]' : ''}`)

  // 활성 지역 코드 조회
  let sggCodes: string[]
  if (sggArg) {
    sggCodes = sggArg.split(',').map(s => s.trim())
  } else {
    const { data: regionRows, error: regErr } = await supabase
      .from('regions')
      .select('sgg_code')
      .eq('is_active', true)
      .order('sgg_code')
    if (regErr) throw new Error(`regions 조회 실패: ${regErr.message}`)
    sggCodes = (regionRows ?? []).map((r: { sgg_code: string }) => r.sgg_code)
  }

  // umd_nm=null 거래가 있는 최초 연월 확인
  const { data: minRow } = await supabase
    .from('transactions')
    .select('deal_date')
    .is('umd_nm', null)
    .is('cancel_date', null)
    .is('superseded_by', null)
    .order('deal_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const earliest = minRow
    ? (minRow as { deal_date: string }).deal_date.slice(0, 7).replace('-', '')
    : '201601'

  const now = new Date()
  const latest = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const months = monthRange(earliest, latest)

  // 전체 (sgg_code, ym) 조합 생성
  const targets = sggCodes.flatMap(sggCode =>
    months.map(ym => ({ sggCode, ym }))
  )

  console.log(`📍 지역: ${sggCodes.join(', ')}`)
  console.log(`📅 기간: ${earliest} ~ ${latest} (${months.length}개월)`)
  console.log(`📋 총 조합: ${targets.length}개 (지역×월)`)
  console.log(`⚠️  예상 API 호출: ~${targets.length * 4}회`)
  console.log()

  const stats = { updated: 0, noInfo: 0, apiCalls: 0 }

  for (let i = 0; i < targets.length; i++) {
    const { sggCode, ym } = targets[i]!
    process.stdout.write(`\r[${i + 1}/${targets.length}] ${sggCode} ${ym} ... (업데이트: ${stats.updated})`)

    try {
      await processYearMonth(sggCode, ym, stats)
    } catch (err) {
      console.error(`\n  ❌ ${sggCode} ${ym}: ${err instanceof Error ? err.message : String(err)}`)
    }

    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`\n\n✅ 완료`)
  console.log(`  업데이트: ${stats.updated}건`)
  console.log(`  API 응답에 jibun/umd_nm 없음: ${stats.noInfo}건`)
  console.log(`  총 API 호출: ${stats.apiCalls}회`)

  if (stats.updated > 0 && !DRY_RUN) {
    console.log('\n💡 다음 단계: npx tsx scripts/link-transactions.ts 재실행하여 complex_id 연결')
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
