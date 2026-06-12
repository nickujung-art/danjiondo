import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface QuadrantPoint {
  complexId: string
  complexName: string
  x: number       // 평당가 (만원/평)
  y: number       // 전세가율 (%)
  isTarget: boolean
}

export interface QuadrantData {
  points: QuadrantPoint[]
  medianX: number
  medianY: number
  regionLabel: string
  totalCount: number
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : ((sorted[mid - 1]! + sorted[mid]!) / 2)
}

export async function getQuadrantData(
  targetComplexId: string,
  si: string,
  gu: string,
  supabase: SupabaseClient<Database>,
): Promise<QuadrantData> {
  const regionLabel = `${si} ${gu}`

  // SQL RPC에서 시/구 단지별 평당가를 서버사이드 집계 (기존: 80K 행 JS 계산)
  const { data, error } = await (supabase as any).rpc('get_quadrant_data', {
    p_si: si,
    p_gu: gu,
  })

  if (error) throw new Error(`get_quadrant_data RPC failed: ${error.message}`)
  if (!data || data.length === 0) {
    return { points: [], medianX: 0, medianY: 0, regionLabel, totalCount: 0 }
  }

  const points: QuadrantPoint[] = (data as { complex_id: string; complex_name: string; avg_sale_pp: number; avg_jeonse_pp: number }[]).map(row => {
    const saleAvg   = Number(row.avg_sale_pp)
    const jeonseAvg = Number(row.avg_jeonse_pp)
    return {
      complexId:   row.complex_id,
      complexName: row.complex_name,
      x: Math.round(saleAvg * 10) / 10,
      y: Math.round((jeonseAvg / saleAvg) * 1000) / 10,
      isTarget: row.complex_id === targetComplexId,
    }
  })

  const medianX = median(points.map(p => p.x))
  const medianY = median(points.map(p => p.y))

  return { points, medianX, medianY, regionLabel, totalCount: points.length }
}
