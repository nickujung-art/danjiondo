import type { SupabaseClient } from '@supabase/supabase-js'

export interface MapPanelData {
  id:                  string
  canonical_name:      string
  si:                  string | null
  gu:                  string | null
  avg_sale_per_pyeong: number | null
  household_count:     number | null
  built_year:          number | null
  recent_trades: Array<{
    deal_date: string
    price:     number
    area_m2:   number | null
    floor:     number | null
  }>
  hagwon_grade: string | null
  detail_url:   string
}

export async function getMapPanelData(
  complexId: string,
  supabase: SupabaseClient,
): Promise<MapPanelData | null> {
  // 단지 기본정보 조회
  const { data: complex, error: complexError } = await supabase
    .from('complexes')
    .select('id, canonical_name, si, gu, avg_sale_per_pyeong, household_count, built_year, hagwon_score')
    .eq('id', complexId)
    .maybeSingle()

  if (complexError) throw new Error(`getMapPanelData complex: ${complexError.message}`)
  if (!complex) return null

  // 최근 매매 거래 3건 — cancel_date IS NULL AND superseded_by IS NULL 필수 (CLAUDE.md)
  const { data: trades, error: tradesError } = await supabase
    .from('transactions')
    .select('deal_date, price, area_m2, floor')
    .eq('complex_id', complexId)
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .order('deal_date', { ascending: false })
    .limit(3)

  if (tradesError) throw new Error(`getMapPanelData trades: ${tradesError.message}`)

  const r = complex as {
    id:                  string
    canonical_name:      string
    si:                  string | null
    gu:                  string | null
    avg_sale_per_pyeong: number | null
    household_count:     number | null
    built_year:          number | null
    hagwon_score:        number | null
  }

  return {
    id:                  r.id,
    canonical_name:      r.canonical_name,
    si:                  r.si ?? null,
    gu:                  r.gu ?? null,
    avg_sale_per_pyeong: r.avg_sale_per_pyeong ?? null,
    household_count:     r.household_count ?? null,
    built_year:          r.built_year ?? null,
    recent_trades: (trades ?? []).map((t) => ({
      deal_date: t.deal_date as string,
      price:     t.price as number,
      area_m2:   (t.area_m2 as number | null) ?? null,
      floor:     (t.floor as number | null) ?? null,
    })),
    // hagwon_score는 정수(raw 학원수 가중합) — PERCENT_RANK RPC로 전체 분포 대비 등급 계산
    hagwon_grade: r.hagwon_score !== null
      ? ((await supabase.rpc('get_hagwon_grade', { p_complex_id: complexId })).data ?? null) as string | null
      : null,
    detail_url:   `/complexes/${complexId}`,
  }
}
