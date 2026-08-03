import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getActiveSggCodes } from './regions'
import { SITE_ID } from '@/lib/data/site'

const WINDOW_DAYS = 30

export type RankType = 'high_price' | 'volume' | 'price_per_pyeong' | 'interest' | 'price_change'

export interface RankingRow {
  id: string
  canonical_name: string
  si: string | null
  gu: string | null
  score: number
  rank: number
  area_m2?: number | null  // 신고가 탭: 해당 거래 면적
}

// ── 읽기 함수 (createReadonlyClient 또는 admin client 모두 사용 가능) ──────────

/**
 * complex_rankings 테이블에서 rank_type별 상위 N개 결과를 반환한다.
 * page.tsx에서 createReadonlyClient()로 호출 → ISR 가능.
 */
export async function getRankingsByType(
  supabase: SupabaseClient<Database>,
  rankType: RankType,
  limit = 10,
): Promise<RankingRow[]> {
  const { data, error } = await supabase
    .from('complex_rankings')
    .select(`
      score, rank, metadata,
      complexes!inner (id, canonical_name, si, gu)
    `)
    .eq('rank_type', rankType)
    .eq('window_days', WINDOW_DAYS)
    .order('rank', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`getRankingsByType(${rankType}) failed: ${error.message}`)

  const results: RankingRow[] = []
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const c = Array.isArray(r.complexes) ? r.complexes[0] : r.complexes
    if (!c) continue
    const meta = r.metadata as Record<string, unknown> | null
    results.push({
      id: c.id as string,
      canonical_name: c.canonical_name as string,
      si: c.si as string | null,
      gu: c.gu as string | null,
      score: Number(r.score),
      rank: Number(r.rank),
      area_m2: typeof meta?.area_m2 === 'number' ? meta.area_m2 : null,
    })
  }
  return results
}

// ── 집계 함수 (createSupabaseAdminClient()로만 호출) ──────────────────────────

interface AggRow {
  complex_id: string
  score: number
  metadata?: Record<string, unknown>
}

async function aggregateHighPrice(supabase: SupabaseClient<Database>, activeSggCodes: string[]): Promise<AggRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .split('T')[0]!

  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', thirtyDaysAgo)
    .in('sgg_code', activeSggCodes)
    .not('complex_id', 'is', null)
    .order('price', { ascending: false })
    .limit(2000)

  if (error) throw new Error(`aggregateHighPrice failed: ${error.message}`)

  // 단지별 최고가 + 해당 거래 면적 집계
  const map = new Map<string, { price: number; area_m2: number | null }>()
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const cid: string = r.complex_id
    const price: number = r.price
    const cur = map.get(cid)
    if (!cur || price > cur.price) map.set(cid, { price, area_m2: r.area_m2 ?? null })
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b.price - a.price)
    .slice(0, 100)
    .map(([complex_id, { price, area_m2 }]) => ({
      complex_id,
      score: price,
      metadata: area_m2 != null ? { area_m2 } : undefined,
    }))
}

async function aggregateVolume(supabase: SupabaseClient<Database>, activeSggCodes: string[]): Promise<AggRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .split('T')[0]!

  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', thirtyDaysAgo)
    .in('sgg_code', activeSggCodes)
    .not('complex_id', 'is', null)
    .limit(5000)

  if (error) throw new Error(`aggregateVolume failed: ${error.message}`)

  const map = new Map<string, number>()
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const cid: string = r.complex_id
    map.set(cid, (map.get(cid) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 100)
    .map(([complex_id, score]) => ({ complex_id, score }))
}

async function aggregatePricePerPyeong(supabase: SupabaseClient<Database>, activeSggCodes: string[]): Promise<AggRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .split('T')[0]!

  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', thirtyDaysAgo)
    .in('sgg_code', activeSggCodes)
    .not('complex_id', 'is', null)
    .gt('area_m2', 0)
    .limit(5000)

  if (error) throw new Error(`aggregatePricePerPyeong failed: ${error.message}`)

  const map = new Map<string, { sum: number; count: number }>()
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const cid: string = r.complex_id
    const pricePerPyeong = (r.price as number) / ((r.area_m2 as number) / 3.3058)
    const cur = map.get(cid) ?? { sum: 0, count: 0 }
    map.set(cid, { sum: cur.sum + pricePerPyeong, count: cur.count + 1 })
  }
  return Array.from(map.entries())
    .map(([complex_id, { sum, count }]) => ({
      complex_id,
      score: Math.round(sum / count),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)
}

async function aggregateInterest(supabase: SupabaseClient<Database>, activeSggCodes: string[]): Promise<AggRow[]> {
  // favorites JOIN complexes → sgg_code 필터 (favorites 테이블에 sgg_code 없음)
  const { data, error } = await supabase
    .from('favorites')
    .select(`
      complex_id,
      complexes!inner (sgg_code)
    `)
    .eq('site_id', SITE_ID)
    .in('complexes.sgg_code', activeSggCodes)
    .limit(5000)

  if (error) throw new Error(`aggregateInterest failed: ${error.message}`)

  const map = new Map<string, number>()
  for (const row of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const cid: string = r.complex_id
    map.set(cid, (map.get(cid) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 100)
    .map(([complex_id, score]) => ({ complex_id, score }))
}

// ── 등락률(price_change) — 창부레터 0-5 ──────────────────────────────────────
// 현재 30일 창의 단지별 평균가를 직전 30일 창과 비교한다. 창부레터 홈 히어로의
// riseRank·avgRise·hotArea 가 이 rank_type 에 의존한다 (ADR-005 §1 LOCKED —
// 실시간 RPC 집계는 PostgREST statement_timeout=8s 때문에 기각됐다).

/** 양쪽 창 모두 이 건수 미만인 단지는 제외한다. 1~2건짜리는 등락률이 널뛰어 hotArea 를 왜곡한다 */
const PRICE_CHANGE_MIN_TX = 3
/** 기존 aggregateVolume·aggregatePricePerPyeong 과 같은 조회 상한 */
const PRICE_CHANGE_QUERY_LIMIT = 5000
/** 기존 4종과 같은 결과 상한 */
const PRICE_CHANGE_TOP_N = 100

/** 조회 상한 절단이 있었는지를 함께 실어 보내는 집계 결과 */
interface AggResult {
  rows: AggRow[]
  truncated?: boolean
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0]!
}

/**
 * 한 창(window)의 단지별 거래가 합계·건수를 집계한다.
 * toDateExclusive 가 있으면 `deal_date < toDateExclusive` 를 추가한다(직전 창).
 */
async function fetchPriceWindow(
  supabase: SupabaseClient<Database>,
  activeSggCodes: string[],
  fromDate: string,
  toDateExclusive: string | null,
): Promise<{ map: Map<string, { sum: number; count: number }>; truncated: boolean }> {
  let query = supabase
    .from('transactions')
    .select('complex_id, price')
    // 🔴 취소·정정 거래 배제 — ADR-003 · CLAUDE.md · Scope Fence 5. 누락하면 등락률이 오염된다
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', fromDate)

  if (toDateExclusive !== null) query = query.lt('deal_date', toDateExclusive)

  const { data, error } = await query
    .in('sgg_code', activeSggCodes)
    .not('complex_id', 'is', null)
    // 상한에 걸릴 때 결정적으로(최신순으로) 잘리게 한다
    .order('deal_date', { ascending: false })
    .limit(PRICE_CHANGE_QUERY_LIMIT)

  if (error) {
    throw new Error(
      `aggregatePriceChange window(${fromDate}~${toDateExclusive ?? 'now'}) failed: ${error.message}`,
    )
  }

  const rows = data ?? []
  const map = new Map<string, { sum: number; count: number }>()
  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    const cid: string = r.complex_id
    const price = r.price as number | null
    if (price == null) continue
    const cur = map.get(cid) ?? { sum: 0, count: 0 }
    map.set(cid, { sum: cur.sum + price, count: cur.count + 1 })
  }
  return { map, truncated: rows.length >= PRICE_CHANGE_QUERY_LIMIT }
}

async function aggregatePriceChange(
  supabase: SupabaseClient<Database>,
  activeSggCodes: string[],
): Promise<AggResult> {
  const curFrom = daysAgo(WINDOW_DAYS) // 현재 창: [today-30, now]
  const prevFrom = daysAgo(WINDOW_DAYS * 2) // 직전 창: [today-60, today-30)

  // 두 창을 병렬 조회한다 (크론 소요시간 증가를 절반으로)
  const [cur, prev] = await Promise.all([
    fetchPriceWindow(supabase, activeSggCodes, curFrom, null),
    fetchPriceWindow(supabase, activeSggCodes, prevFrom, curFrom),
  ])

  // 🔴 조용한 절단이 최악이다 — 로그도 플래그도 없으면 등락률이 틀려도 아무도 모른다.
  //    throw 하지 않는다: 던지면 정상 동작 중인 기존 4종까지 크론 500 으로 같이 죽는다.
  const truncated = cur.truncated || prev.truncated
  if (truncated) {
    console.warn(
      `[aggregatePriceChange] 조회 상한 ${PRICE_CHANGE_QUERY_LIMIT}행에 도달했다 — ` +
        `등락률이 일부 거래를 누락한 채 계산됐다 (current=${cur.truncated}, previous=${prev.truncated})`,
    )
  }

  interface Change {
    complex_id: string
    score: number
    cur_avg: number
    prev_avg: number
    cur_count: number
    prev_count: number
  }

  const changes: Change[] = []
  for (const [complexId, c] of cur.map) {
    if (c.count < PRICE_CHANGE_MIN_TX) continue
    const p = prev.map.get(complexId)
    if (!p || p.count < PRICE_CHANGE_MIN_TX) continue

    const curAvg = c.sum / c.count
    const prevAvg = p.sum / p.count
    if (!(prevAvg > 0)) continue // 0으로 나누지 않는다

    changes.push({
      complex_id: complexId,
      score: Math.round(((curAvg - prevAvg) / prevAvg) * 100 * 10) / 10,
      cur_avg: Math.round(curAvg),
      prev_avg: Math.round(prevAvg),
      cur_count: c.count,
      prev_count: p.count,
    })
  }

  const top = changes.sort((a, b) => b.score - a.score).slice(0, PRICE_CHANGE_TOP_N)
  if (top.length === 0) return { rows: [], truncated }

  // hotArea 근사(40-CONTEXT D-05): 지역명을 1회 조회해 전 행 metadata 에 담는다.
  // 1위 행만이 아니라 전 행에 넣는 이유 — 조회 비용이 같고, 창부레터가 riseRank[]
  // 각 항목의 지역도 바로 쓸 수 있다.
  const regionById = new Map<string, string | null>()
  const { data: complexRows, error: complexError } = await supabase
    .from('complexes')
    .select('id, si, gu')
    .in('id', top.map((t) => t.complex_id))
    .limit(PRICE_CHANGE_TOP_N)

  if (complexError) {
    throw new Error(`aggregatePriceChange complexes 조회 실패: ${complexError.message}`)
  }
  for (const row of complexRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any
    regionById.set(r.id as string, (r.gu as string | null) ?? (r.si as string | null) ?? null)
  }

  return {
    rows: top.map((t) => ({
      complex_id: t.complex_id,
      score: t.score,
      metadata: {
        region: regionById.get(t.complex_id) ?? null,
        cur_avg: t.cur_avg,
        prev_avg: t.prev_avg,
        cur_count: t.cur_count,
        prev_count: t.prev_count,
      },
    })),
    truncated,
  }
}

/**
 * 5종 랭킹을 집계해 complex_rankings 테이블에 UPSERT한다.
 * cron endpoint에서 createSupabaseAdminClient()를 전달받아 호출한다.
 */
export async function computeRankings(
  supabase: SupabaseClient<Database>,
): Promise<{ type: RankType; upserted: number; ms: number; truncated?: boolean }[]> {
  const computedAt = new Date().toISOString()
  const activeSggCodes = await getActiveSggCodes(supabase)

  // price_change 는 배열 끝에 둔다 — 기존 4종이 먼저 끝나 부분 실패 시 손실이 작다.
  // 반환 타입이 유니온인 이유: 기존 4종은 AggRow[] 를 그대로 두고(Scope Fence 10),
  // 절단 플래그가 필요한 price_change 만 AggResult 를 돌려준다.
  const aggregators: Array<{
    type: RankType
    fn: (s: SupabaseClient<Database>, codes: string[]) => Promise<AggRow[] | AggResult>
  }> = [
    { type: 'high_price', fn: aggregateHighPrice },
    { type: 'volume', fn: aggregateVolume },
    { type: 'price_per_pyeong', fn: aggregatePricePerPyeong },
    { type: 'interest', fn: aggregateInterest },
    { type: 'price_change', fn: aggregatePriceChange },
  ]

  const results: { type: RankType; upserted: number; ms: number; truncated?: boolean }[] = []

  for (const { type, fn } of aggregators) {
    const startedAt = Date.now()
    const out = await fn(supabase, activeSggCodes)
    const rows = Array.isArray(out) ? out : out.rows
    const truncated = Array.isArray(out) ? undefined : out.truncated

    if (rows.length === 0) {
      results.push({ type, upserted: 0, ms: Date.now() - startedAt, ...(truncated ? { truncated } : {}) })
      continue
    }

    const upsertRows = rows.map((row, idx) => ({
      complex_id: row.complex_id,
      rank_type: type,
      score: row.score,
      rank: idx + 1,
      window_days: WINDOW_DAYS,
      computed_at: computedAt,
      metadata: row.metadata ?? null,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('complex_rankings')
      .upsert(upsertRows, {
        onConflict: 'rank_type,complex_id,window_days',
        ignoreDuplicates: false,
      })

    if (error) throw new Error(`computeRankings UPSERT(${type}) failed: ${error.message}`)
    results.push({
      type,
      upserted: upsertRows.length,
      ms: Date.now() - startedAt,
      ...(truncated ? { truncated } : {}),
    })
  }

  return results
}
