import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// ─── Allowlists ───────────────────────────────────────────────────────────────

export const ALLOWED_SGG_CODES = ['48121', '48123', '48125', '48127', '48128', '48129', '48250'] as const
export const ALLOWED_AREA_BUCKETS = ['소형', '59', '84', '대형'] as const
export type AreaBucket = typeof ALLOWED_AREA_BUCKETS[number]

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegionalPricePoint {
  yearMonth: string
  avgPrice:  number
  txCount:   number
}

export interface AreaType {
  bucket:  AreaBucket
  txCount: number
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * 지역 단위 월별 시세 이력 조회.
 * invest_regional_price_history RPC를 호출한다.
 * 오류 시 빈 배열 반환 (페이지 레벨에서 .catch(() => []) 처리).
 */
export async function getRegionalPriceHistory(
  supabase:   SupabaseClient<Database>,
  sggCode:    string | undefined,
  areaBucket: AreaBucket | undefined,
  months = 24,
): Promise<RegionalPricePoint[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('invest_regional_price_history', {
    p_sgg_code:    sggCode    ?? null,
    p_area_bucket: areaBucket ?? null,
    p_months:      months,
  })
  if (error || !data) return []
  return (data as Array<{ year_month: string; avg_price: number; tx_count: number }>).map(r => ({
    yearMonth: r.year_month,
    avgPrice:  Number(r.avg_price),
    txCount:   Number(r.tx_count),
  }))
}

/**
 * 단지의 거래 가능 타입 목록 조회 (tx_count >= 3인 타입만).
 * transactions 직접 쿼리 사용 (area_m2 기준 버킷화).
 * 오류 시 빈 배열 반환.
 */
export async function getComplexAreaTypes(
  supabase:  SupabaseClient<Database>,
  complexId: string,
  months = 24,
): Promise<AreaType[]> {
  const buckets: AreaBucket[] = ['소형', '59', '84', '대형']
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const result: AreaType[] = []
  for (const bucket of buckets) {
    const bucketFilter =
      bucket === '소형'
        ? { lt: 50 }
        : bucket === '59'
        ? { gte: 50, lt: 66 }
        : bucket === '84'
        ? { gte: 66, lt: 95 }
        : { gte: 95 }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('complex_id', complexId)
      .eq('deal_type', 'sale')
      .gte('deal_date', cutoffStr)
      .is('cancel_date', null)
      .is('superseded_by', null)

    if ('lt' in bucketFilter && 'gte' in bucketFilter) {
      q = q
        .gte('area_m2', (bucketFilter as { gte: number; lt: number }).gte)
        .lt('area_m2', (bucketFilter as { gte: number; lt: number }).lt)
    } else if ('lt' in bucketFilter) {
      q = q.lt('area_m2', (bucketFilter as { lt: number }).lt)
    } else {
      q = q.gte('area_m2', (bucketFilter as { gte: number }).gte)
    }

    const { count } = await q
    if ((count ?? 0) >= 3) {
      result.push({ bucket, txCount: count ?? 0 })
    }
  }
  return result
}

/**
 * 단지+타입별 월별 시세 이력 조회.
 * invest_price_history RPC를 호출한다.
 * 오류 시 빈 배열 반환.
 */
export async function getComplexPriceByType(
  supabase:   SupabaseClient<Database>,
  complexId:  string,
  areaBucket: AreaBucket | undefined,
  months = 24,
): Promise<RegionalPricePoint[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('invest_price_history', {
    p_complex_id:  complexId,
    p_deal_type:   'sale',
    p_months:      months,
    p_area_bucket: areaBucket ?? null,
  })
  if (error || !data) return []
  return (data as Array<{ year_month: string; avg_price: number; tx_count: number }>).map(r => ({
    yearMonth: r.year_month,
    avgPrice:  Number(r.avg_price),
    txCount:   Number(r.tx_count),
  }))
}
