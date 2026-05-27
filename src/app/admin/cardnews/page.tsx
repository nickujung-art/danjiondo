import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { CardnewsDownloadButton } from '@/components/admin/CardnewsDownloadButton'
import { AdminCardnewsCopyButton } from '@/components/admin/AdminCardnewsCopyButton'

export const revalidate = 0

export const metadata = {
  title: '카드뉴스 생성 — 단지온도 관리자',
}

export default async function AdminCardnewsPage() {
  // 관리자 권한 확인
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

  // 최근 30일 신고가 TOP 5 (카드뉴스 텍스트 생성용)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '')

  const { data: topDeals } = await supabase
    .from('transactions')
    .select('complex_id, price, area_m2, deal_date, complexes(canonical_name, sgg_code)')
    .gte('deal_date', thirtyDaysAgo)
    .is('cancel_date', null)
    .is('superseded_by', null)
    .eq('deal_type', 'sale')
    .order('price', { ascending: false })
    .limit(5)

  const periodStart = new Date(thirtyDaysAgo.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))
  const periodEnd   = new Date()
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`

  const lines = (topDeals ?? []).map((d, i) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (d as any).complexes as { canonical_name: string } | null
    const name  = c?.canonical_name ?? '(단지명 없음)'
    const price = Math.round(Number(d.price) / 10000)
    const area  = Number(d.area_m2).toFixed(0)
    return `${i + 1}위. ${name} — ${price.toLocaleString()}억원 (${area}㎡)`
  })

  const cardnewsText = [
    '📊 이번 주 창원·김해 신고가 TOP 5',
    '',
    ...lines,
    '',
    `📅 집계 기간: ${fmtDate(periodStart)} ~ ${fmtDate(periodEnd)}`,
    '🔗 단지온도에서 상세 보기: https://danjiondo.kr',
  ].join('\n').slice(0, 500)

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 32px' }}>
        <h1
          style={{
            font: '700 22px/1.3 var(--font-sans)',
            letterSpacing: '-0.02em',
            margin: '0 0 8px',
          }}
        >
          카드뉴스 생성
        </h1>
        <p
          style={{
            font: '500 14px/1.6 var(--font-sans)',
            color: 'var(--fg-sec)',
            margin: '0 0 32px',
          }}
        >
          주간 신고가 TOP 5 카드뉴스를 1080×1080 PNG로 생성합니다. SNS 업로드용.
        </p>

        <div
          className="card"
          style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          <div>
            <div
              style={{
                font: '600 14px/1.4 var(--font-sans)',
                marginBottom: 4,
              }}
            >
              주간 신고가 TOP 5
            </div>
            <div
              style={{
                font: '500 13px/1.5 var(--font-sans)',
                color: 'var(--fg-tertiary)',
              }}
            >
              최근 30일 · 창원·김해 실거래가 기준 상위 5개 단지
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <CardnewsDownloadButton />
            <AdminCardnewsCopyButton text={cardnewsText} />
          </div>
        </div>
      </div>
  )
}
