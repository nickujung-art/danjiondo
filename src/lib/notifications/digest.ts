import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { SITE_ID } from '@/lib/data/site'

const BATCH_SIZE = 50 // deliver.ts와 동일한 배치 크기

// ISO 주번호 (YYYY-WW 형식)
function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `digest-${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export async function buildWeeklyDigest(
  supabase: SupabaseClient<Database>,
): Promise<{ inserted: number }> {
  // 1. 관심 단지가 있는 사용자 전체 조회 (N+1 방지)
  // limit: 10,000 — digest is a batch job; unbounded load would OOM a serverless fn
  const { data: favorites } = await supabase
    .from('favorites')
    .select('user_id, complex_id')
    .eq('site_id', SITE_ID)
    .limit(10000)

  if (!favorites?.length) return { inserted: 0 }

  // 2. user별 관심 단지 묶기
  const userComplexMap = new Map<string, string[]>()
  for (const fav of favorites) {
    const list = userComplexMap.get(fav.user_id) ?? []
    list.push(fav.complex_id)
    userComplexMap.set(fav.user_id, list)
  }

  // 3. unique complex_id 배치로 최근 거래 조회
  const allComplexIds = [...new Set(favorites.map((f) => f.complex_id))]
  const { data: recentTrades } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2, deal_date, complexes(name)')
    .in('complex_id', allComplexIds)
    .is('cancel_date', null) // transactions 대원칙
    .is('superseded_by', null) // transactions 대원칙
    .order('deal_date', { ascending: false })
    .limit(allComplexIds.length * 3) // 단지당 최근 3건

  // complex_id별 최근 거래 인덱싱
  const tradesByComplex = new Map<string, (typeof recentTrades & {})[number][]>()
  for (const trade of recentTrades ?? []) {
    if (!trade.complex_id) continue
    const list = tradesByComplex.get(trade.complex_id) ?? []
    list.push(trade)
    tradesByComplex.set(trade.complex_id, list)
  }

  // 4. 사용자별 digest content 생성 + notifications INSERT
  const weekKey = getWeekKey(new Date())
  const notifications: Array<{
    user_id: string
    type: string
    event_type: string
    target_id: string | null
    dedupe_key: string
    title: string
    body: string
  }> = []

  for (const [userId, complexIds] of userComplexMap) {
    const tradeLines = complexIds
      .flatMap((cid) => (tradesByComplex.get(cid) ?? []).slice(0, 1))
      .map((t) => {
        const priceStr = t.price != null ? `${(t.price / 10000).toLocaleString('ko-KR')}억원` : ''
        const name = (t.complexes as { name?: string } | null)?.name ?? t.complex_id ?? ''
        return `· ${name} ${t.area_m2}㎡ ${priceStr}`.trimEnd()
      })

    const body =
      tradeLines.length > 0
        ? tradeLines.join('\n')
        : '이번 주 관심 단지에 새 거래가 없습니다.'

    notifications.push({
      user_id: userId,
      type: 'digest',
      event_type: 'weekly_digest',
      target_id: null,
      dedupe_key: weekKey,
      title: '이번 주 관심 단지 요약',
      body,
    })
  }

  // 5. 배치 INSERT (UNIQUE 충돌 시 skip — 이미 발송된 주)
  // ignoreDuplicates=true: ON CONFLICT (user_id,event_type,target_id,dedupe_key) DO NOTHING
  let inserted = 0
  for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
    const batch = notifications.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('notifications')
      .insert(batch)
    if (!error) inserted += batch.length
  }

  return { inserted }
}
