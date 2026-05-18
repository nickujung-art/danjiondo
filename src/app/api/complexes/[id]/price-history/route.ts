import { NextResponse } from 'next/server'
import { createReadonlyClient } from '@/lib/supabase/readonly'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface PricePoint {
  month: string  // 'YYYY-MM'
  price: number  // 만원 단위 월 평균
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ prices: [] })
  }

  const supabase = createReadonlyClient()

  const since = new Date()
  since.setMonth(since.getMonth() - 9)
  const sinceStr = since.toISOString().slice(0, 10)

  // CRITICAL: cancel_date IS NULL AND superseded_by IS NULL (CLAUDE.md)
  const { data } = await supabase
    .from('transactions')
    .select('price, deal_date')
    .eq('complex_id', id)
    .eq('deal_type', 'sale')
    .is('cancel_date', null)
    .is('superseded_by', null)
    .gte('deal_date', sinceStr)
    .order('deal_date', { ascending: true })

  // 월별 평균가 집계
  const monthMap = new Map<string, number[]>()
  for (const tx of (data ?? []) as { price: number; deal_date: string }[]) {
    const month = tx.deal_date.slice(0, 7)
    const bucket = monthMap.get(month)
    if (bucket) bucket.push(tx.price)
    else monthMap.set(month, [tx.price])
  }

  const prices: PricePoint[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, ps]) => ({
      month,
      price: Math.round(ps.reduce((s, p) => s + p, 0) / ps.length),
    }))

  return NextResponse.json({ prices }, {
    headers: {
      // Vercel Edge 1시간 캐시 — 첫 호출 이후 동일 단지는 즉시 응답
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
