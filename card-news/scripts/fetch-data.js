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
export async function fetchAreaRanking({ sggCode, areaMin, areaMax, dealType = 'sale', limit = 10 }) {
  const { from, to } = getLastWeekRange()

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
export async function fetchCityRanking({ sggCodes, dealType = 'sale', limit = 10 }) {
  const { from, to } = getLastWeekRange()

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
export async function fetchVolumeRanking({ sggCodes, limit = 10 }) {
  const { from, to } = getLastWeekRange()

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
export async function fetchValueRanking({ sggCodes, areaMin = 80, areaMax = 95, limit = 10 }) {
  const { from, to } = getLastWeekRange()

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

/**
 * 구별 대장단지 — 각 구 최고가 단지 1개씩
 */
export async function fetchDistrictChampions({ sggMap, dealType = 'sale' }) {
  const { from, to } = getLastWeekRange()
  const allCodes = Object.keys(sggMap)

  const { data, error } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2, sgg_code')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', allCodes)
    .not('complex_id', 'is', null)
    .limit(5000)

  if (error) throw new Error(`fetchDistrictChampions: ${error.message}`)

  // 구별로 최고가 단지 1개 선정
  const byGu = new Map() // sggCode → { complex_id, price, area_m2 }
  for (const t of data ?? []) {
    const cur = byGu.get(t.sgg_code)
    if (!cur || t.price > cur.price) byGu.set(t.sgg_code, { complex_id: t.complex_id, price: t.price, area_m2: t.area_m2 })
  }

  const complexIds = [...byGu.values()].map((v) => v.complex_id).filter(Boolean)
  const cmap = await fetchComplexNames(complexIds)

  return allCodes.map((code, i) => {
    const best = byGu.get(code)
    const c = best ? cmap.get(best.complex_id) : null
    return {
      rank: i + 1,
      district: sggMap[code],
      name: c?.canonical_name ?? null,
      price: best ? formatPrice(best.price) : null,
    }
  })
}
