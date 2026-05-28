import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { RiskLevel } from './gap-stats'

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
