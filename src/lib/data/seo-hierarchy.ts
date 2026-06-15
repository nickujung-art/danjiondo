import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ComplexDetail } from './complex-detail'
import { createReadonlyClient } from '@/lib/supabase/readonly'

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

export interface SiPageData {
  si:             string
  guList:         Array<{ gu: string; complexCount: number; avgPrice: number | null }>
  dongList:       Array<{ dong: string; complexCount: number; avgPrice: number | null }>  // 김해시용 (W1)
  totalComplexes: number
}

export interface GuPageData {
  si:             string
  gu:             string
  dongList:       Array<{ dong: string; complexCount: number; avgPrice: number | null }>
  totalComplexes: number
}

export interface DongPageData {
  si:             string
  gu:             string | null
  dong:           string
  avgPrice:       number | null  // 동 평균 평당가 (W1)
  complexes:      Array<{
    id:              string
    canonical_name:  string
    url_slug:        string | null
    built_year:      number | null
    household_count: number | null
  }>
}

// ──────────────────────────────────────────
// Functions
// ──────────────────────────────────────────

/** 시(시) 레벨 — 창원: gu별 집계 / 김해: dong별 집계 (avgPrice 포함, W1) */
export async function getSiPageData(
  si: string,
  supabase: SupabaseClient<Database>,
): Promise<SiPageData | null> {
  const { data, error } = await supabase
    .from('complexes')
    .select('gu, dong, avg_sale_per_pyeong')
    .eq('si', si)
    .eq('status', 'active')
    .not('url_slug', 'is', null)

  if (error || !data || data.length === 0) return null

  const hasGu = data.some(c => c.gu)

  if (hasGu) {
    // 창원시 — gu별 집계 (avgPrice 포함)
    const byGu = new Map<string, { count: number; prices: number[] }>()
    for (const c of data) {
      if (!c.gu) continue
      const entry = byGu.get(c.gu) ?? { count: 0, prices: [] }
      entry.count++
      if (c.avg_sale_per_pyeong) entry.prices.push(c.avg_sale_per_pyeong)
      byGu.set(c.gu, entry)
    }
    return {
      si,
      guList: [...byGu.entries()].map(([gu, { count, prices }]) => ({
        gu,
        complexCount: count,
        avgPrice: prices.length
          ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
          : null,
      })),
      dongList: [],
      totalComplexes: data.length,
    }
  } else {
    // 김해시 — dong별 집계 (avgPrice 포함, W1)
    const byDong = new Map<string, { count: number; prices: number[] }>()
    for (const c of data) {
      if (!c.dong) continue
      const entry = byDong.get(c.dong) ?? { count: 0, prices: [] }
      entry.count++
      if (c.avg_sale_per_pyeong) entry.prices.push(c.avg_sale_per_pyeong)
      byDong.set(c.dong, entry)
    }
    return {
      si,
      guList: [],
      dongList: [...byDong.entries()].map(([dong, { count, prices }]) => ({
        dong,
        complexCount: count,
        avgPrice: prices.length
          ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
          : null,
      })),
      totalComplexes: data.length,
    }
  }
}

/** 구(구) 레벨 — 창원시 전용 */
export async function getGuPageData(
  si: string,
  gu: string,
  supabase: SupabaseClient<Database>,
): Promise<GuPageData | null> {
  const { data, error } = await supabase
    .from('complexes')
    .select('dong, avg_sale_per_pyeong')
    .eq('si', si)
    .eq('gu', gu)
    .eq('status', 'active')
    .not('url_slug', 'is', null)

  if (error || !data || data.length === 0) return null

  const byDong = new Map<string, { count: number; prices: number[] }>()
  for (const c of data) {
    if (!c.dong) continue
    const entry = byDong.get(c.dong) ?? { count: 0, prices: [] }
    entry.count++
    if (c.avg_sale_per_pyeong) entry.prices.push(c.avg_sale_per_pyeong)
    byDong.set(c.dong, entry)
  }

  return {
    si,
    gu,
    dongList: [...byDong.entries()].map(([dong, { count, prices }]) => ({
      dong,
      complexCount: count,
      avgPrice: prices.length
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : null,
    })),
    totalComplexes: data.length,
  }
}

/** 동(동) 레벨 — 해당 동 단지 목록 + 동 평균 평당가 (W1) */
export async function getDongPageData(
  si: string,
  gu: string | null,
  dong: string,
  supabase: SupabaseClient<Database>,
): Promise<DongPageData | null> {
  let query = supabase
    .from('complexes')
    .select('id, canonical_name, url_slug, built_year, household_count, avg_sale_per_pyeong')
    .eq('si', si)
    .eq('dong', dong)
    .eq('status', 'active')
    .not('url_slug', 'is', null)
    .order('household_count', { ascending: false })

  if (gu) query = query.eq('gu', gu)

  const { data, error } = await query
  if (error || !data || data.length === 0) return null

  // 동 평균 평당가 계산 (W1)
  const prices = (data as Array<typeof data[0] & { avg_sale_per_pyeong: number | null }>)
    .map(c => c.avg_sale_per_pyeong)
    .filter((p): p is number => p != null)
  const avgPrice: number | null = prices.length
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : null

  return {
    si,
    gu,
    dong,
    avgPrice,
    complexes: data as DongPageData['complexes'],
  }
}

/**
 * url_slug로 단지 조회 — catch-all 라우트에서 단지 상세 판별용
 * D-09: url_slug=null인 143개 단지는 이 함수로 조회 불가 (빈 slug 쿼리 방지)
 */
export async function getComplexBySlug(
  urlSlug: string,
  supabase: SupabaseClient<Database>,
): Promise<(ComplexDetail & { url_slug: string }) | null> {
  if (!urlSlug) return null
  const { data, error } = await supabase
    .from('complexes')
    .select(`
      id, canonical_name, road_address,
      si, gu, dong,
      built_year, household_count, floors_above, heat_type,
      sgg_code, status, lat, lng, url_slug
    `)
    .eq('url_slug', urlSlug)
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) return null
  return data as ComplexDetail & { url_slug: string }
}

// 요청 단위 캐시 — generateMetadata + SlugPage에서 중복 조회 방지
export const getComplexBySlugCached = cache(async (urlSlug: string): Promise<(ComplexDetail & { url_slug: string }) | null> => {
  const supabase = createReadonlyClient()
  return getComplexBySlug(urlSlug, supabase)
})
