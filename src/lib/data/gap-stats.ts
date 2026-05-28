import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const WINDOW_MONTHS = 12

export type RiskLevel = 'safe' | 'caution' | 'danger'

/** D-02: 갭 비율 기준 위험도 분류 (40% 미만=safe, 40~60%=caution, 60% 초과=danger) */
export function computeRiskLevel(gapRatio: number): RiskLevel {
  if (gapRatio < 40) return 'safe'
  if (gapRatio <= 60) return 'caution'
  return 'danger'
}

export interface GapStatsRow {
  complexId: string
  medianSalePrice: number
  medianJeonsePrice: number
  gapAmount: number
  gapRatio: number
  jeonseRatio: number
  riskLevel: RiskLevel
  saleCount: number
  jeonseCount: number
}

interface RpcRow {
  complex_id: string
  median_sale_price: number
  median_jeonse_price: number
  gap_amount: number
  gap_ratio: number
  jeonse_ratio: number
  sale_count: number
  jeonse_count: number
}

interface ComputeGapStatsResult {
  complexesUpdated: number
  complexesSkipped: number
  errors: string[]
}

/**
 * compute_gap_stats SQL RPC를 호출해 갭 통계를 계산하고
 * complex_gap_stats 테이블에 UPSERT한다.
 * createSupabaseAdminClient()로 생성한 supabase만 전달할 것.
 */
export async function computeGapStats(
  supabase: SupabaseClient<Database>,
): Promise<ComputeGapStatsResult> {
  const errors: string[] = []

  // SQL RPC로 전체 집계 (DB에서 PERCENTILE_CONT 계산)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcRows, error: rpcError } = await (supabase as any).rpc('compute_gap_stats', {
    p_window_months: WINDOW_MONTHS,
  })

  if (rpcError) {
    return {
      complexesUpdated: 0,
      complexesSkipped: 0,
      errors: [`compute_gap_stats RPC: ${rpcError.message}`],
    }
  }

  const rows = (rpcRows ?? []) as RpcRow[]

  if (rows.length === 0) {
    return { complexesUpdated: 0, complexesSkipped: 0, errors: [] }
  }

  const computedAt = new Date().toISOString()
  const upsertRows = rows.map(row => ({
    complex_id:          row.complex_id,
    median_sale_price:   row.median_sale_price,
    median_jeonse_price: row.median_jeonse_price,
    gap_amount:          row.gap_amount,
    gap_ratio:           row.gap_ratio,
    jeonse_ratio:        row.jeonse_ratio,
    risk_level:          computeRiskLevel(Number(row.gap_ratio)),
    sale_count:          row.sale_count,
    jeonse_count:        row.jeonse_count,
    window_months:       WINDOW_MONTHS,
    computed_at:         computedAt,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upsertError } = await (supabase as any)
    .from('complex_gap_stats')
    .upsert(upsertRows, { onConflict: 'complex_id', ignoreDuplicates: false })

  if (upsertError) {
    errors.push(`complex_gap_stats UPSERT: ${upsertError.message}`)
    return { complexesUpdated: 0, complexesSkipped: rows.length, errors }
  }

  return { complexesUpdated: upsertRows.length, complexesSkipped: 0, errors }
}
