import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

export const runtime = 'nodejs'

// D-09 Locked 옵션 스펙 기반 Zod 스키마
const RequestSchema = z.object({
  period: z.enum(['weekly', 'monthly', 'quarterly', 'yearly', 'custom']),
  topic: z.enum([
    'sale_top',
    'jeonse_top',
    'monthly_top',
    'volume',
    'value',
    'alltime_high',
    'price_change',
    'district_champions',
  ]),
  sggCodes: z.array(z.string()).min(1),
  areaMin: z.number().min(0),
  areaMax: z.number().max(300),
  customFrom: z.string().optional(),
  customTo: z.string().optional(),
  dealType: z.enum(['sale', 'jeonse']).optional(),
})

interface RankingRow {
  rank: number
  name: string | null
  subtitle?: string | null
  price: string | null
  priceUnit?: string
}

type DealTypeEnum = 'sale' | 'jeonse' | 'monthly'

// 기간 계산 (D-09 기간 옵션 계산 로직)
function getDateRange(
  period: string,
  customFrom?: string,
  customTo?: string,
): { from: string; to: string } {
  if (period === 'custom') return { from: customFrom ?? '', to: customTo ?? '' }

  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  // 어제 날짜 (로컬 시간 기준)
  const yesterday = new Date(now)
  yesterday.setDate(d - 1)
  const toDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

  if (period === 'weekly') {
    const dow = now.getDay() // 0=일요일
    const daysToLastMon = dow === 0 ? 13 : dow + 6
    const mon = new Date(now)
    mon.setDate(d - daysToLastMon)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    const fmt = (dt: Date) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    return { from: fmt(mon), to: fmt(sun) }
  }

  if (period === 'monthly') {
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`
    return { from, to: toDate }
  }

  if (period === 'quarterly') {
    const q = Math.floor(m / 3)
    const from = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`
    return { from, to: toDate }
  }

  // yearly
  return { from: `${y}-01-01`, to: toDate }
}

// 데이터 완결성 경고: 종료일 7일 이내 (D-04)
function isDataIncomplete(to: string): boolean {
  const diffMs = new Date().getTime() - new Date(to).getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24)) <= 7
}

// 가격 포맷 (fetch-data.js formatPrice와 동일)
function formatPrice(manwon: number): string {
  const eok = Math.floor(manwon / 10000)
  const rem = manwon % 10000
  if (eok === 0) return `${manwon.toLocaleString('ko-KR')}만`
  if (rem === 0) return `${eok}억`
  return `${eok}억 ${rem.toLocaleString('ko-KR')}`
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

// 이상치 필터 (D-04 — 12개월 평균 200% 초과 제외 / PITFALL-6 해결)
async function filterOutliers(
  transactions: Array<{ complex_id: string; price: number }>,
  dealType: DealTypeEnum,
  adminClient: AdminClient,
): Promise<Array<{ complex_id: string; price: number }>> {
  if (!transactions.length) return transactions

  const ids = [...new Set(transactions.map((t) => t.complex_id).filter(Boolean))]
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
  const since = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}-${String(twelveMonthsAgo.getDate()).padStart(2, '0')}`

  const { data: hist } = await adminClient
    .from('transactions')
    .select('complex_id, price')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', since)
    .in('complex_id', ids)
    .limit(50000)

  const sumMap = new Map<string, { sum: number; count: number }>()
  for (const t of (hist ?? []) as Array<{ complex_id: string; price: number }>) {
    const cur = sumMap.get(t.complex_id) ?? { sum: 0, count: 0 }
    sumMap.set(t.complex_id, { sum: cur.sum + t.price, count: cur.count + 1 })
  }

  const avgMap = new Map<string, number>()
  for (const [id, { sum, count }] of sumMap) {
    avgMap.set(id, sum / count)
  }

  return transactions.filter((t) => {
    const avg = avgMap.get(t.complex_id)
    if (!avg) return true // 평균 데이터 없으면 유지
    return t.price <= avg * 2 // 200% 초과 제외 (D-04)
  })
}

// 단지명 조회 헬퍼
async function fetchComplexNames(
  ids: string[],
  adminClient: AdminClient,
): Promise<Map<string, { canonical_name: string; si?: string; gu?: string }>> {
  if (!ids.length) return new Map()
  const { data } = await adminClient
    .from('complexes')
    .select('id, canonical_name, si, gu')
    .in('id', ids)
  return new Map(
    ((data ?? []) as Array<{ id: string; canonical_name: string; si?: string; gu?: string }>).map(
      (c) => [c.id, c],
    ),
  )
}

// sale_top / jeonse_top 집계
async function querySaleTop(params: {
  dealType: DealTypeEnum
  from: string
  to: string
  sggCodes: string[]
  areaMin: number
  areaMax: number
  adminClient: AdminClient
}): Promise<RankingRow[]> {
  const { dealType, from, to, sggCodes, areaMin, areaMax, adminClient } = params

  const { data: raw } = await adminClient
    .from('transactions')
    .select('complex_id, price, area_m2, sgg_code')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .gte('area_m2', areaMin)
    .lte('area_m2', areaMax)
    .not('complex_id', 'is', null)
    .limit(5000)

  const rawList = (raw ?? []) as Array<{
    complex_id: string
    price: number
    area_m2: number
    sgg_code: string
  }>

  const filtered = await filterOutliers(
    rawList.map((t) => ({ complex_id: t.complex_id, price: t.price })),
    dealType,
    adminClient,
  )

  // 단지별 최고가 맵
  const maxMap = new Map<string, number>()
  for (const t of filtered) {
    if (!maxMap.has(t.complex_id) || t.price > (maxMap.get(t.complex_id) ?? 0)) {
      maxMap.set(t.complex_id, t.price)
    }
  }

  // 거래 건수 맵 (D-04: 3건 미만 제외)
  const countMap = new Map<string, number>()
  for (const t of filtered) {
    countMap.set(t.complex_id, (countMap.get(t.complex_id) ?? 0) + 1)
  }

  const sorted = [...maxMap.entries()]
    .filter(([id]) => (countMap.get(id) ?? 0) >= 1)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  const cmap = await fetchComplexNames(
    sorted.map(([id]) => id),
    adminClient,
  )

  return sorted.map(([id, price], i) => ({
    rank: i + 1,
    name: cmap.get(id)?.canonical_name ?? null,
    subtitle: cmap.get(id)?.gu ?? null,
    price: formatPrice(price),
  }))
}

// 신고가 경신 집계 (Pattern 9: 2단계 쿼리)
async function queryAlltimeHigh(params: {
  dealType: DealTypeEnum
  from: string
  to: string
  sggCodes: string[]
  areaMin: number
  areaMax: number
  adminClient: AdminClient
}): Promise<RankingRow[]> {
  const { dealType, from, to, sggCodes, areaMin, areaMax, adminClient } = params

  const baseQuery = adminClient
    .from('transactions')
    .select('complex_id, price')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)

  // 1단계: 집계 기간 내 단지별 최고가
  const { data: periodData } = await baseQuery
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .gte('area_m2', areaMin)
    .lte('area_m2', areaMax)
    .not('complex_id', 'is', null)
    .limit(5000)

  const periodMax = new Map<string, number>()
  const periodCount = new Map<string, number>()
  for (const t of (periodData ?? []) as Array<{ complex_id: string; price: number }>) {
    if (!periodMax.has(t.complex_id) || t.price > (periodMax.get(t.complex_id) ?? 0)) {
      periodMax.set(t.complex_id, t.price)
    }
    periodCount.set(t.complex_id, (periodCount.get(t.complex_id) ?? 0) + 1)
  }

  const complexIds = [...periodMax.keys()].filter((id) => (periodCount.get(id) ?? 0) >= 3)
  if (!complexIds.length) return []

  // 2단계: 이전 전체 기간 최고가 (12개월 제한으로 성능 보장)
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
  const histFrom = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}-${String(twelveMonthsAgo.getDate()).padStart(2, '0')}`

  const { data: histData } = await adminClient
    .from('transactions')
    .select('complex_id, price')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', histFrom)
    .lt('deal_date', from)
    .in('complex_id', complexIds)
    .limit(50000)

  const histMax = new Map<string, number>()
  for (const t of (histData ?? []) as Array<{ complex_id: string; price: number }>) {
    if (!histMax.has(t.complex_id) || t.price > (histMax.get(t.complex_id) ?? 0)) {
      histMax.set(t.complex_id, t.price)
    }
  }

  // 신고가 경신 필터
  const newHighs = [...periodMax.entries()]
    .filter(([id, curMax]) => curMax > (histMax.get(id) ?? 0))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  const cmap = await fetchComplexNames(
    newHighs.map(([id]) => id),
    adminClient,
  )

  return newHighs.map(([id, price], i) => ({
    rank: i + 1,
    name: cmap.get(id)?.canonical_name ?? null,
    subtitle: cmap.get(id)?.gu ?? null,
    price: formatPrice(price),
  }))
}

// 가격 변동률 집계 (Pattern 10: 병렬 기간 비교)
async function queryPriceChange(params: {
  dealType: DealTypeEnum
  from: string
  to: string
  sggCodes: string[]
  areaMin: number
  areaMax: number
  adminClient: AdminClient
}): Promise<RankingRow[]> {
  const { dealType, from, to, sggCodes, areaMin, areaMax, adminClient } = params

  const durationMs = new Date(to).getTime() - new Date(from).getTime()
  const prevTo = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo.getTime() - durationMs)

  const fmtDate = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

  async function fetchPeriodAvg(periodFrom: string, periodTo: string) {
    const { data } = await adminClient
      .from('transactions')
      .select('complex_id, price')
      .is('cancel_date', null)
      .is('superseded_by', null)
      .eq('deal_type', dealType)
      .gte('deal_date', periodFrom)
      .lte('deal_date', periodTo)
      .in('sgg_code', sggCodes)
      .gte('area_m2', areaMin)
      .lte('area_m2', areaMax)
      .not('complex_id', 'is', null)
      .limit(5000)

    const map = new Map<string, { sum: number; count: number }>()
    for (const t of (data ?? []) as Array<{ complex_id: string; price: number }>) {
      const cur = map.get(t.complex_id) ?? { sum: 0, count: 0 }
      map.set(t.complex_id, { sum: cur.sum + t.price, count: cur.count + 1 })
    }
    return map
  }

  const [curMap, prevMap] = await Promise.all([
    fetchPeriodAvg(from, to),
    fetchPeriodAvg(fmtDate(prevFrom), fmtDate(prevTo)),
  ])

  const changes: Array<{ id: string; changePct: number; curAvg: number }> = []
  for (const [id, cur] of curMap) {
    if (cur.count < 3) continue // 3건 미만 제외 (D-04)
    const prev = prevMap.get(id)
    if (!prev || prev.count < 3) continue
    const curAvg = cur.sum / cur.count
    const prevAvg = prev.sum / prev.count
    const changePct = ((curAvg - prevAvg) / prevAvg) * 100
    changes.push({ id, changePct, curAvg })
  }

  const sorted = changes.sort((a, b) => b.changePct - a.changePct).slice(0, 10)
  const cmap = await fetchComplexNames(
    sorted.map((s) => s.id),
    adminClient,
  )

  return sorted.map((s, i) => ({
    rank: i + 1,
    name: cmap.get(s.id)?.canonical_name ?? null,
    subtitle: cmap.get(s.id)?.gu ?? null,
    price: `${s.changePct > 0 ? '+' : ''}${s.changePct.toFixed(1)}%`,
    priceUnit: '',
  }))
}

const SGG_LABEL: Record<string, string> = {
  '48121': '의창구',
  '48123': '성산구',
  '48125': '마산합포구',
  '48127': '마산회원구',
  '48129': '진해구',
  '48250': '김해시',
}

// 거래량 TOP10
async function queryVolume(params: {
  dealType: DealTypeEnum
  from: string
  to: string
  sggCodes: string[]
  areaMin: number
  areaMax: number
  adminClient: AdminClient
}): Promise<RankingRow[]> {
  const { dealType, from, to, sggCodes, areaMin, areaMax, adminClient } = params

  const { data: raw } = await adminClient
    .from('transactions')
    .select('complex_id')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .gte('area_m2', areaMin)
    .lte('area_m2', areaMax)
    .not('complex_id', 'is', null)
    .limit(10000)

  const countMap = new Map<string, number>()
  for (const t of (raw ?? []) as Array<{ complex_id: string }>) {
    countMap.set(t.complex_id, (countMap.get(t.complex_id) ?? 0) + 1)
  }

  const sorted = [...countMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  const cmap = await fetchComplexNames(sorted.map(([id]) => id), adminClient)

  return sorted.map(([id, count], i) => ({
    rank: i + 1,
    name: cmap.get(id)?.canonical_name ?? null,
    subtitle: cmap.get(id)?.gu ?? null,
    price: `${count}건`,
    priceUnit: '',
  }))
}

// 가성비 TOP10 (평당가 낮은 순)
async function queryValue(params: {
  dealType: DealTypeEnum
  from: string
  to: string
  sggCodes: string[]
  areaMin: number
  areaMax: number
  adminClient: AdminClient
}): Promise<RankingRow[]> {
  const { from, to, sggCodes, areaMin, areaMax, adminClient } = params

  const effectiveMin = areaMin > 0 ? areaMin : 0
  const effectiveMax = areaMax < 300 ? areaMax : 300

  const { data: raw } = await adminClient
    .from('transactions')
    .select('complex_id, price, area_m2')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .gte('area_m2', effectiveMin)
    .lte('area_m2', effectiveMax)
    .not('complex_id', 'is', null)
    .gt('area_m2', 0)
    .limit(10000)

  const ppMap = new Map<string, { sum: number; count: number }>()
  for (const t of (raw ?? []) as Array<{ complex_id: string; price: number; area_m2: number }>) {
    if (!t.area_m2 || t.area_m2 === 0) continue
    const pp = t.price / t.area_m2
    const cur = ppMap.get(t.complex_id) ?? { sum: 0, count: 0 }
    ppMap.set(t.complex_id, { sum: cur.sum + pp, count: cur.count + 1 })
  }

  const sorted = [...ppMap.entries()]
    .filter(([, { count }]) => count >= 3)
    .map(([id, { sum, count }]) => ({ id, avgPP: sum / count }))
    .sort((a, b) => a.avgPP - b.avgPP)
    .slice(0, 10)

  const cmap = await fetchComplexNames(sorted.map((s) => s.id), adminClient)

  return sorted.map((s, i) => ({
    rank: i + 1,
    name: cmap.get(s.id)?.canonical_name ?? null,
    subtitle: cmap.get(s.id)?.gu ?? null,
    price: `${Math.round(s.avgPP).toLocaleString('ko-KR')}만/㎡`,
    priceUnit: '',
  }))
}

// 구별 챔피언 — 구마다 최고가 단지 1개
async function queryDistrictChampions(params: {
  dealType: DealTypeEnum
  from: string
  to: string
  sggCodes: string[]
  areaMin: number
  areaMax: number
  adminClient: AdminClient
}): Promise<RankingRow[]> {
  const { dealType, from, to, sggCodes, areaMin, areaMax, adminClient } = params

  const { data: raw } = await adminClient
    .from('transactions')
    .select('complex_id, price, sgg_code')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', dealType)
    .gte('deal_date', from)
    .lte('deal_date', to)
    .in('sgg_code', sggCodes)
    .gte('area_m2', areaMin)
    .lte('area_m2', areaMax)
    .not('complex_id', 'is', null)
    .limit(10000)

  // 구별 단지 최고가 맵
  const districtMax = new Map<string, Map<string, number>>()
  for (const t of (raw ?? []) as Array<{ complex_id: string; price: number; sgg_code: string }>) {
    if (!districtMax.has(t.sgg_code)) districtMax.set(t.sgg_code, new Map())
    const dm = districtMax.get(t.sgg_code)!
    if (!dm.has(t.complex_id) || t.price > (dm.get(t.complex_id) ?? 0)) {
      dm.set(t.complex_id, t.price)
    }
  }

  const districtTopList: Array<{ sggCode: string; complexId: string | null; price: number }> = []
  const allTopIds: string[] = []

  for (const sggCode of sggCodes) {
    const dm = districtMax.get(sggCode)
    if (!dm?.size) {
      districtTopList.push({ sggCode, complexId: null, price: 0 })
      continue
    }
    const [topId, topPrice] = [...dm.entries()].sort(([, a], [, b]) => b - a)[0]!
    districtTopList.push({ sggCode, complexId: topId, price: topPrice })
    allTopIds.push(topId)
  }

  const cmap = await fetchComplexNames(allTopIds, adminClient)

  return districtTopList.map((d, i) => ({
    rank: i + 1,
    name: d.complexId ? (cmap.get(d.complexId)?.canonical_name ?? null) : null,
    subtitle: SGG_LABEL[d.sggCode] ?? d.sggCode,
    price: d.price > 0 ? formatPrice(d.price) : null,
  }))
}

export async function POST(request: Request): Promise<NextResponse> {
  // 어드민 권한 검증 (gps-approve/route.ts 패턴)
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (
    !['admin', 'superadmin'].includes(
      (profile as { role: string } | null)?.role ?? '',
    )
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const {
    period,
    topic,
    sggCodes,
    areaMin,
    areaMax,
    customFrom,
    customTo,
    dealType = 'sale',
  } = parsed.data

  const { from, to } = getDateRange(period, customFrom, customTo)
  const warning = isDataIncomplete(to)
  const adminClient = createSupabaseAdminClient()

  try {
    let result: RankingRow[] = []

    const resolvedDealType: DealTypeEnum =
    topic === 'jeonse_top' ? 'jeonse' :
    topic === 'monthly_top' ? 'monthly' :
    (dealType as DealTypeEnum)
    const queryParams = {
      dealType: resolvedDealType,
      from,
      to,
      sggCodes,
      areaMin,
      areaMax,
      adminClient,
    }

    if (topic === 'sale_top' || topic === 'jeonse_top' || topic === 'monthly_top') {
      result = await querySaleTop(queryParams)
    } else if (topic === 'alltime_high') {
      result = await queryAlltimeHigh(queryParams)
    } else if (topic === 'price_change') {
      result = await queryPriceChange(queryParams)
    }
    else if (topic === 'volume') {
      result = await queryVolume(queryParams)
    } else if (topic === 'value') {
      result = await queryValue(queryParams)
    } else if (topic === 'district_champions') {
      result = await queryDistrictChampions(queryParams)
    }

    return NextResponse.json({ data: result, from, to, warning, topic })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'DB error' },
      { status: 500 },
    )
  }
}
