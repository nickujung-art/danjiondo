import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { RiskLevel } from './gap-stats'

// ─── Ranking types (Wave 3) ──────────────────────────────────────────────────

export interface GapRankingFilter {
  sggCode?: string
  riskLevel?: 'safe' | 'caution' | 'danger'
}

export interface GapRankingRow {
  complexId: string
  complexName: string
  si: string | null
  gu: string | null
  sggCode: string | null
  gapRatio: number
  gapAmount: number
  jeonseRatio: number
  riskLevel: RiskLevel
  saleCount: number
  jeonseCount: number
}

const ALLOWED_SGG_CODES = ['48121', '48123', '48125', '48127', '48129', '48250']
const ALLOWED_RISK_LEVELS: ReadonlyArray<string> = ['safe', 'caution', 'danger']

/**
 * complex_gap_stats JOIN complexes 조회.
 * 갭 비율 높은 순 정렬, 최대 200건.
 * createReadonlyClient()로 생성한 supabase를 전달한다.
 */
export async function getGapRankings(
  filter: GapRankingFilter,
  supabase: SupabaseClient<Database>,
): Promise<GapRankingRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('complex_gap_stats')
    .select(
      'gap_ratio, gap_amount, jeonse_ratio, risk_level, sale_count, jeonse_count, complexes!inner(id, canonical_name, sgg_code, si, gu)',
    )
    .order('gap_ratio', { ascending: false })
    .limit(200)

  if (filter.sggCode && ALLOWED_SGG_CODES.includes(filter.sggCode)) {
    query = query.eq('complexes.sgg_code', filter.sggCode)
  }

  if (filter.riskLevel && ALLOWED_RISK_LEVELS.includes(filter.riskLevel)) {
    query = query.eq('risk_level', filter.riskLevel)
  }

  const { data, error } = await query

  if (error || !data) return []

  type RawRow = {
    gap_ratio: string | number
    gap_amount: number
    jeonse_ratio: string | number
    risk_level: string
    sale_count: number
    jeonse_count: number
    complexes:
      | { id: string; canonical_name: string; sgg_code: string | null; si: string | null; gu: string | null }
      | Array<{ id: string; canonical_name: string; sgg_code: string | null; si: string | null; gu: string | null }>
      | null
  }

  const result: GapRankingRow[] = []
  for (const raw of data as RawRow[]) {
    const c = Array.isArray(raw.complexes) ? raw.complexes[0] : raw.complexes
    if (!c) continue
    result.push({
      complexId:   c.id,
      complexName: c.canonical_name,
      si:          c.si,
      gu:          c.gu,
      sggCode:     c.sgg_code,
      gapRatio:    Number(raw.gap_ratio),
      gapAmount:   raw.gap_amount,
      jeonseRatio: Number(raw.jeonse_ratio),
      riskLevel:   raw.risk_level as RiskLevel,
      saleCount:   raw.sale_count,
      jeonseCount: raw.jeonse_count,
    })
  }
  return result
}

export interface ComplexGapStatsResult {
  complexId: string
  medianSalePrice: number
  medianJeonsePrice: number
  gapAmount: number
  gapRatio: number
  jeonseRatio: number
  riskLevel: RiskLevel
  saleCount: number
  jeonseCount: number
  computedAt: string
}

/**
 * 단지 상세 페이지에서 complex_gap_stats 테이블을 단건 조회한다.
 * createReadonlyClient()로 생성한 supabase를 전달한다.
 * 데이터 없으면 null 반환 (섹션 숨김 처리용).
 */
export async function getComplexGapStats(
  complexId: string,
  supabase: SupabaseClient<Database>,
): Promise<ComplexGapStatsResult | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('complex_gap_stats')
    .select(
      'complex_id, median_sale_price, median_jeonse_price, gap_amount, gap_ratio, jeonse_ratio, risk_level, sale_count, jeonse_count, computed_at',
    )
    .eq('complex_id', complexId)
    .maybeSingle()

  if (error || !data) return null

  const row = data as {
    complex_id: string
    median_sale_price: number
    median_jeonse_price: number
    gap_amount: number
    gap_ratio: string | number
    jeonse_ratio: string | number
    risk_level: string
    sale_count: number
    jeonse_count: number
    computed_at: string
  }

  return {
    complexId:         row.complex_id,
    medianSalePrice:   row.median_sale_price,
    medianJeonsePrice: row.median_jeonse_price,
    gapAmount:         row.gap_amount,
    gapRatio:          Number(row.gap_ratio),
    jeonseRatio:       Number(row.jeonse_ratio),
    riskLevel:         row.risk_level as RiskLevel,
    saleCount:         row.sale_count,
    jeonseCount:       row.jeonse_count,
    computedAt:        row.computed_at,
  }
}
