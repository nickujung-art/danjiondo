import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { CardnewsDashboardClient } from '@/components/admin/cardnews/CardnewsDashboardClient'

export const revalidate = 0

export const metadata = {
  title: '카드뉴스 관리 — 단지온도 관리자',
}

export default async function AdminCardnewsPage() {
  // 인증/권한 확인
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/cardnews')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  // 최근 30일 신고가 TOP 5
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replaceAll('-', '')

  const { data: rawDeals } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2, deal_date, complexes(canonical_name, sgg_code)')
    .gte('deal_date', thirtyDaysAgo)
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .order('price', { ascending: false })
    .limit(5)

  // TopDeal 변환
  const topDeals = (rawDeals ?? []).map((d, i) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (d as any).complexes as { canonical_name: string } | null
    return {
      rank: i + 1,
      name: c?.canonical_name ?? '(단지명 없음)',
      priceEok: Math.round(Number(d.price) / 10000),
      areaSqm: Number(d.area_m2).toFixed(0),
    }
  })

  // SNS 공유 텍스트 생성
  const periodStart = new Date(thirtyDaysAgo.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))
  const periodEnd   = new Date()
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`

  const lines = topDeals.map((d) =>
    `${d.rank}위. ${d.name} — ${d.priceEok.toLocaleString()}억원 (${d.areaSqm}㎡)`
  )
  const cardnewsText = [
    '📊 이번 주 창원·김해 신고가 TOP 5',
    '',
    ...lines,
    '',
    `📅 집계 기간: ${fmtDate(periodStart)} ~ ${fmtDate(periodEnd)}`,
    '🔗 단지온도에서 상세 보기: https://danjiondo.kr',
  ].join('\n').slice(0, 500)

  const periodLabel = `${fmtDate(periodStart)} ~ ${fmtDate(periodEnd)}`

  return (
    <CardnewsDashboardClient
      topDeals={topDeals}
      cardnewsText={cardnewsText}
      periodLabel={periodLabel}
    />
  )
}
