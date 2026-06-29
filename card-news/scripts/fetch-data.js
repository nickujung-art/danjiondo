/**
 * fetch-data.js — Supabase에서 주간 실거래가 집계
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n' +
    'Create card-news/.env with these values.',
  )
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

// ── 날짜 유틸 ─────────────────────────────────────────────

/**
 * 기간 타입에 따른 날짜 범위 반환
 * @param {'weekly'|'monthly'|'quarterly'|'yearly'|'custom'} type
 * @param {string} [customFrom] - 'custom' 타입일 때 시작일 (YYYY-MM-DD)
 * @param {string} [customTo]   - 'custom' 타입일 때 종료일 (YYYY-MM-DD)
 * @returns {{ from: string, to: string }}
 */
export function getDateRange(type, customFrom, customTo) {
  if (type === 'custom') return { from: customFrom, to: customTo }
  const now = new Date()
  // 로컬 시간 기준 날짜 포맷 (toISOString은 UTC 기준이므로 UTC+9 환경에서 날짜가 달라질 수 있음)
  const fmtLocal = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const yesterday = fmtLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  if (type === 'weekly') return getLastWeekRange()
  if (type === 'monthly') {
    return { from: fmtLocal(new Date(now.getFullYear(), now.getMonth(), 1)), to: yesterday }
  }
  if (type === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3)
    return { from: fmtLocal(new Date(now.getFullYear(), q * 3, 1)), to: yesterday }
  }
  if (type === 'yearly') {
    return { from: `${now.getFullYear()}-01-01`, to: yesterday }
  }
  throw new Error(`Unknown period type: ${type}`)
}

/** 지난 주 월~일 반환 */
export function getLastWeekRange() {
  const now = new Date()
  const dow = now.getDay() // 0=Sun
  const daysToLastMon = dow === 0 ? 13 : dow + 6
  const mon = new Date(now)
  mon.setDate(now.getDate() - daysToLastMon)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = (d) => d.toISOString().split('T')[0]
  return { from: fmt(mon), to: fmt(sun) }
}

export function getWeekLabel(from) {
  const d = new Date(from)
  const month = d.getMonth() + 1
  const weekOfMonth = Math.ceil(d.getDate() / 7)
  return `${d.getFullYear()}년 ${month}월 ${weekOfMonth}주차`
}

export function getWeekCode(from) {
  const d = new Date(from)
  // ISO week number (approximate)
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const diff = d - jan4
  const weekNum = Math.ceil((diff / 86400000 + jan4.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export function getPeriodLabel(from, to) {
  const fmt = (s) => s.slice(5).replace('-', '.')
  return `${fmt(from)} ~ ${fmt(to)} 신고 건`
}

// ── 가격 포맷 ─────────────────────────────────────────────

export function formatPrice(manwon) {
  if (!Number.isFinite(manwon) || manwon < 0) return '—'
  const eok = Math.floor(manwon / 10000)
  const rem = manwon % 10000
  if (eok === 0) return `${manwon.toLocaleString('ko-KR')}만`
  if (rem === 0) return `${eok}억`
  return `${eok}억 ${rem.toLocaleString('ko-KR')}`
}

// ── 복합 이름 패치 헬퍼 ───────────────────────────────────

async function fetchComplexNames(ids) {
  if (!ids.length) return new Map()
  const { data } = await supabase
    .from('complexes')
    .select('id, canonical_name, si, gu')
    .in('id', ids)
  return new Map((data ?? []).map((c) => [c.id, c]))
}

// ── 시리즈별 집계 ─────────────────────────────────────────

/**
 * 구별 + 평형별 최고가 TOP 10 (Series A/B: 구별 랭킹)
 */
export async function fetchAreaRanking({ sggCode, areaMin, areaMax, dealType = 'sale', limit = 10, from: fromArg, to: toArg }) {
  const { from, to } = fromArg ? { from: fromArg, to: toArg } : getLastWeekRange()

  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', from)
    .lte('deal_date', to)
    .eq('sgg_code', sggCode)
    .gte('area_m2', areaMin)
    .lte('area_m2', areaMax)
    .not('complex_id', 'is', null)
    .limit(5000)

  if (error) throw new Error(`fetchAreaRanking: ${error.message}`)

  const map = new Map()
  for (const t of data ?? []) {
    const cur = map.get(t.complex_id)
    if (!cur || t.price > cur.price) map.set(t.complex_id, { price: t.price, area_m2: t.area_m2 })
  }

  const sorted = [...map.entries()]
    .sort(([, a], [, b]) => b.price - a.price)
    .slice(0, limit)

  const cmap = await fetchComplexNames(sorted.map(([id]) => id))

  return sorted.map(([id, { price }], i) => ({
    rank: i + 1,
    name: cmap.get(id)?.canonical_name ?? null,
    price: formatPrice(price),
  }))
}

/**
 * 창원+김해 전체 최고가 TOP 10 (Series C: 창원 전체 랭킹)
 */
export async function fetchCityRanking({ sggCodes, dealType = 'sale', limit = 10, from: fromArg, to: toArg }) {
  const { from, to } = fromArg ? { from: fromArg, to: toArg } : getLastWeekRange()

  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2, sgg_code')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .not('complex_id', 'is', null)
    .limit(5000)

  if (error) throw new Error(`fetchCityRanking: ${error.message}`)

  const map = new Map()
  for (const t of data ?? []) {
    const cur = map.get(t.complex_id)
    if (!cur || t.price > cur.price) map.set(t.complex_id, { price: t.price, area_m2: t.area_m2 })
  }

  const sorted = [...map.entries()]
    .sort(([, a], [, b]) => b.price - a.price)
    .slice(0, limit)

  const cmap = await fetchComplexNames(sorted.map(([id]) => id))

  return sorted.map(([id, { price }], i) => {
    const c = cmap.get(id)
    return {
      rank: i + 1,
      name: c?.canonical_name ?? null,
      subtitle: c ? (c.gu ?? c.si) : null,
      price: formatPrice(price),
    }
  })
}

/**
 * 거래량 TOP 10 (Series D: 거래 활발 단지)
 */
export async function fetchVolumeRanking({ sggCodes, limit = 10, from: fromArg, to: toArg }) {
  const { from, to } = fromArg ? { from: fromArg, to: toArg } : getLastWeekRange()

  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .not('complex_id', 'is', null)
    .limit(5000)

  if (error) throw new Error(`fetchVolumeRanking: ${error.message}`)

  const map = new Map()
  for (const t of data ?? []) map.set(t.complex_id, (map.get(t.complex_id) ?? 0) + 1)

  const sorted = [...map.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)

  const cmap = await fetchComplexNames(sorted.map(([id]) => id))

  return sorted.map(([id, count], i) => {
    const c = cmap.get(id)
    return {
      rank: i + 1,
      name: c?.canonical_name ?? null,
      subtitle: c ? (c.gu ?? c.si) : null,
      price: `${count}건`,
      priceUnit: '',
    }
  })
}

/**
 * 가성비 TOP 10 — 평당가 낮은 순 (Series E)
 */
export async function fetchValueRanking({ sggCodes, areaMin = 80, areaMax = 95, limit = 10, from: fromArg, to: toArg }) {
  const { from, to } = fromArg ? { from: fromArg, to: toArg } : getLastWeekRange()

  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .gte('area_m2', areaMin)
    .lte('area_m2', areaMax)
    .not('complex_id', 'is', null)
    .gt('area_m2', 0)
    .limit(5000)

  if (error) throw new Error(`fetchValueRanking: ${error.message}`)

  const map = new Map()
  for (const t of data ?? []) {
    const ppp = t.price / (t.area_m2 / 3.3058)
    const cur = map.get(t.complex_id) ?? { sum: 0, count: 0 }
    map.set(t.complex_id, { sum: cur.sum + ppp, count: cur.count + 1 })
  }

  const sorted = [...map.entries()]
    .map(([id, { sum, count }]) => ({ id, ppp: Math.round(sum / count) }))
    .sort((a, b) => a.ppp - b.ppp)
    .slice(0, limit)

  const cmap = await fetchComplexNames(sorted.map((s) => s.id))

  return sorted.map((s, i) => {
    const c = cmap.get(s.id)
    return {
      rank: i + 1,
      name: c?.canonical_name ?? null,
      subtitle: c ? (c.gu ?? c.si) : null,
      price: `${formatPrice(s.ppp)}/평`,
      priceUnit: '',
    }
  })
}

// ── 이상치 필터 ───────────────────────────────────────────

/**
 * 12개월 평균 대비 200% 초과 거래를 제거한다 (D-04)
 * Pitfall-6 해결책: 이상치 기준가는 항상 12개월 전체 평균으로 별도 쿼리
 * @param {Array} transactions - { complex_id, price, ... }[]
 * @param {string} dealType
 * @returns {Promise<Array>}
 */
export async function filterOutliers(transactions, dealType) {
  if (!transactions.length) return transactions
  const complexIds = [...new Set(transactions.map((t) => t.complex_id).filter(Boolean))]
  if (!complexIds.length) return transactions

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)

  const { data: historical } = await supabase
    .from('transactions')
    .select('complex_id, price')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', twelveMonthsAgo.toISOString().slice(0, 10))
    .in('complex_id', complexIds)
    .limit(50000)

  const sumMap = new Map()
  for (const t of historical ?? []) {
    const cur = sumMap.get(t.complex_id) ?? { sum: 0, count: 0 }
    sumMap.set(t.complex_id, { sum: cur.sum + t.price, count: cur.count + 1 })
  }
  const avgMap = new Map()
  for (const [id, { sum, count }] of sumMap) avgMap.set(id, sum / count)

  return transactions.filter((t) => {
    const avg = avgMap.get(t.complex_id)
    if (!avg) return true
    return t.price <= avg * 2  // 200% 초과 제외 (D-04)
  })
}

// ── 빌더 전용 집계 함수 ───────────────────────────────────

/**
 * 전세 최고가 TOP N (BILD-07, D-11)
 * @param {{ sggCodes: string[], areaMin?: number, areaMax?: number, from: string, to: string, limit?: number }}
 */
export async function fetchJeonseRanking({ sggCodes, areaMin, areaMax, from, to, limit = 10 }) {
  let query = supabase
    .from('transactions')
    .select('complex_id, price, area_m2')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'jeonse')
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .not('complex_id', 'is', null)
    .limit(5000)

  if (areaMin != null) query = query.gte('area_m2', areaMin)
  if (areaMax != null) query = query.lte('area_m2', areaMax)

  const { data, error } = await query
  if (error) throw new Error(`fetchJeonseRanking: ${error.message}`)

  const filtered = await filterOutliers(data ?? [], 'jeonse')

  // 단지별 거래 건수 + 최고가, 3건 미만 제외 (D-04)
  const countMap = new Map()
  const maxMap = new Map()
  for (const t of filtered) {
    countMap.set(t.complex_id, (countMap.get(t.complex_id) ?? 0) + 1)
    const cur = maxMap.get(t.complex_id)
    if (!cur || t.price > cur.price) maxMap.set(t.complex_id, { price: t.price })
  }

  const sorted = [...maxMap.entries()]
    .filter(([id]) => (countMap.get(id) ?? 0) >= 3)
    .sort(([, a], [, b]) => b.price - a.price)
    .slice(0, limit)

  const cmap = await fetchComplexNames(sorted.map(([id]) => id))

  return sorted.map(([id, { price }], i) => {
    const c = cmap.get(id)
    return {
      rank: i + 1,
      name: c?.canonical_name ?? null,
      subtitle: c ? (c.gu ?? c.si) : null,
      price: formatPrice(price),
    }
  })
}

/**
 * 월세 최고 보증금 TOP N (D-09 LOCKED "월세최고보증금", D-11)
 * @param {{ sggCodes: string[], areaMin?: number, areaMax?: number, from: string, to: string, limit?: number }}
 */
export async function fetchMonthlyRanking({ sggCodes, areaMin, areaMax, from, to, limit = 10 }) {
  let query = supabase
    .from('transactions')
    .select('complex_id, price, area_m2')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'monthly')
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .not('complex_id', 'is', null)
    .limit(5000)

  if (areaMin != null) query = query.gte('area_m2', areaMin)
  if (areaMax != null) query = query.lte('area_m2', areaMax)

  const { data, error } = await query
  if (error) throw new Error(`fetchMonthlyRanking: ${error.message}`)

  const filtered = await filterOutliers(data ?? [], 'monthly')

  // 단지별 거래 건수 + 최고 보증금(price), 3건 미만 제외 (D-04)
  const countMap = new Map()
  const maxMap = new Map()
  for (const t of filtered) {
    countMap.set(t.complex_id, (countMap.get(t.complex_id) ?? 0) + 1)
    const cur = maxMap.get(t.complex_id)
    if (!cur || t.price > cur.price) maxMap.set(t.complex_id, { price: t.price })
  }

  const sorted = [...maxMap.entries()]
    .filter(([id]) => (countMap.get(id) ?? 0) >= 3)
    .sort(([, a], [, b]) => b.price - a.price)
    .slice(0, limit)

  const cmap = await fetchComplexNames(sorted.map(([id]) => id))

  return sorted.map(([id, { price }], i) => {
    const c = cmap.get(id)
    return {
      rank: i + 1,
      name: c?.canonical_name ?? null,
      subtitle: c ? (c.gu ?? c.si) : null,
      price: formatPrice(price),
    }
  })
}

/**
 * 신고가 경신 TOP N — 집계 기간 내 최고가 > 이전 전체 기간 최고가인 단지 (BILD-07)
 * @param {{ sggCodes: string[], areaMin?: number, areaMax?: number, from: string, to: string, dealType?: string, limit?: number }}
 */
export async function fetchAllTimeHighRanking({ sggCodes, areaMin, areaMax, from, to, dealType = 'sale', limit = 10 }) {
  // 1단계: 집계 기간 내 단지별 최고가
  let query = supabase
    .from('transactions')
    .select('complex_id, price')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .not('complex_id', 'is', null)
    .limit(5000)

  if (areaMin != null) query = query.gte('area_m2', areaMin)
  if (areaMax != null) query = query.lte('area_m2', areaMax)

  const { data: periodData, error: e1 } = await query
  if (e1) throw new Error(`fetchAllTimeHighRanking(period): ${e1.message}`)

  const filtered = await filterOutliers(periodData ?? [], dealType)

  // 단지별 거래 건수 + 최고가
  const periodCount = new Map()
  const periodMax = new Map()
  for (const t of filtered) {
    periodCount.set(t.complex_id, (periodCount.get(t.complex_id) ?? 0) + 1)
    if (!periodMax.has(t.complex_id) || t.price > periodMax.get(t.complex_id))
      periodMax.set(t.complex_id, t.price)
  }

  // 3건 미만 제외 (D-04)
  for (const [id, count] of periodCount) {
    if (count < 3) periodMax.delete(id)
  }

  if (!periodMax.size) return []

  // 2단계: 해당 단지들의 이전 전체 기간 역대 최고가
  const complexIds = [...periodMax.keys()]
  const { data: histData, error: e2 } = await supabase
    .from('transactions')
    .select('complex_id, price')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)
    .lt('deal_date', from)
    .in('complex_id', complexIds)
    .limit(50000)
  if (e2) throw new Error(`fetchAllTimeHighRanking(hist): ${e2.message}`)

  const histMax = new Map()
  for (const t of histData ?? []) {
    if (!histMax.has(t.complex_id) || t.price > histMax.get(t.complex_id))
      histMax.set(t.complex_id, t.price)
  }

  // 3단계: 신고가 경신 단지만 필터링 (현재 최고가 > 역대 최고가)
  const newHighs = [...periodMax.entries()]
    .filter(([id, curMax]) => curMax > (histMax.get(id) ?? 0))
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)

  const cmap = await fetchComplexNames(newHighs.map(([id]) => id))
  return newHighs.map(([id, price], i) => ({
    rank: i + 1,
    name: cmap.get(id)?.canonical_name ?? null,
    subtitle: cmap.get(id)?.gu ?? null,
    price: formatPrice(price),
  }))
}

/**
 * 가격 변동률 TOP N — 현재 기간 평균가 vs 직전 동일 기간 평균가 (BILD-07)
 * @param {{ sggCodes: string[], areaMin?: number, areaMax?: number, from: string, to: string, dealType?: string, limit?: number }}
 */
export async function fetchPriceChangeRanking({ sggCodes, areaMin, areaMax, from, to, dealType = 'sale', limit = 10 }) {
  const durationMs = new Date(to) - new Date(from)
  const prevTo = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo.getTime() - durationMs)

  async function fetchPeriodAvg(periodFrom, periodTo) {
    let query = supabase
      .from('transactions')
      .select('complex_id, price')
      .is('cancel_date', null)
      .is('superseded_by', null)
      .eq('deal_type', dealType)
      .gte('deal_date', periodFrom)
      .lte('deal_date', periodTo)
      .in('sgg_code', sggCodes)
      .not('complex_id', 'is', null)
      .limit(5000)

    if (areaMin != null) query = query.gte('area_m2', areaMin)
    if (areaMax != null) query = query.lte('area_m2', areaMax)

    const { data, error } = await query
    if (error) throw new Error(`fetchPriceChangeRanking: ${error.message}`)

    const map = new Map()
    for (const t of data ?? []) {
      const cur = map.get(t.complex_id) ?? { sum: 0, count: 0 }
      map.set(t.complex_id, { sum: cur.sum + t.price, count: cur.count + 1 })
    }
    return map
  }

  const [curMap, prevMap] = await Promise.all([
    fetchPeriodAvg(from, to),
    fetchPeriodAvg(prevFrom.toISOString().slice(0, 10), prevTo.toISOString().slice(0, 10)),
  ])

  const changes = []
  for (const [id, cur] of curMap) {
    if (cur.count < 3) continue  // 3건 미만 제외 (D-04)
    const prev = prevMap.get(id)
    if (!prev || prev.count < 3) continue
    const changePct = ((cur.sum / cur.count) - (prev.sum / prev.count)) / (prev.sum / prev.count) * 100
    changes.push({ id, changePct })
  }

  const sorted = changes.sort((a, b) => b.changePct - a.changePct).slice(0, limit)
  const cmap = await fetchComplexNames(sorted.map((s) => s.id))

  return sorted.map((s, i) => ({
    rank: i + 1,
    name: cmap.get(s.id)?.canonical_name ?? null,
    subtitle: cmap.get(s.id)?.gu ?? null,
    price: `${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(1)}%`,
    priceUnit: '',
  }))
}

/**
 * 구별 대장단지 — 각 구 최고 평당가 단지 1개씩 + 전주 대비 변동률
 */
export async function fetchDistrictChampions({ sggMap, dealType = 'sale' }) {
  const { from, to } = getLastWeekRange()
  const allCodes = Object.keys(sggMap)

  const fmt = (d) => d.toISOString().split('T')[0]
  const prevFrom = new Date(from); prevFrom.setDate(prevFrom.getDate() - 7)
  const prevTo = new Date(to); prevTo.setDate(prevTo.getDate() - 7)

  async function fetchWeekTx(weekFrom, weekTo) {
    const { data, error } = await supabase
      .from('transactions')
      .select('complex_id, price, area_m2, sgg_code')
      .is('cancel_date', null)
      .is('superseded_by', null)
      .eq('deal_type', dealType)
      .gte('deal_date', weekFrom)
      .lte('deal_date', weekTo)
      .in('sgg_code', allCodes)
      .not('complex_id', 'is', null)
      .gt('area_m2', 0)
      .limit(5000)
    if (error) throw new Error(`fetchDistrictChampions: ${error.message}`)
    return data ?? []
  }

  const [thisTx, prevTx] = await Promise.all([
    fetchWeekTx(from, to),
    fetchWeekTx(fmt(prevFrom), fmt(prevTo)),
  ])

  // 구별 최고 평당가 단지 선정
  function bestPerPyeong(txList) {
    const byGu = new Map()
    for (const t of txList) {
      const ppp = Math.round(t.price / (t.area_m2 / 3.3058))
      const cur = byGu.get(t.sgg_code)
      if (!cur || ppp > cur.ppp) byGu.set(t.sgg_code, { complex_id: t.complex_id, ppp })
    }
    return byGu
  }

  const thisBest = bestPerPyeong(thisTx)
  const prevBest = bestPerPyeong(prevTx)

  const complexIds = [...thisBest.values()].map((v) => v.complex_id).filter(Boolean)
  const cmap = await fetchComplexNames(complexIds)

  return allCodes.map((code) => {
    const best = thisBest.get(code)
    const prev = prevBest.get(code)
    const c = best ? cmap.get(best.complex_id) : null

    let change = null
    if (best?.ppp && prev?.ppp) {
      change = Math.round(((best.ppp - prev.ppp) / prev.ppp) * 1000) / 10
    }

    return {
      district: sggMap[code],
      name: c?.canonical_name ?? null,
      pricePerPyeong: best?.ppp ?? null,
      change,
    }
  })
}
