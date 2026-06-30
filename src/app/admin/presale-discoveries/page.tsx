import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { PresaleDiscoveryList } from '@/components/admin/PresaleDiscoveryList'

export const revalidate = 0
export const metadata: Metadata = { title: '관리자 · 분양 검수' }

export default async function AdminPresaleDiscoveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/presale-discoveries')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (
    !profile ||
    !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')
  ) {
    redirect('/')
  }

  const params = await searchParams
  const status = (params.status ?? 'pending') as 'pending' | 'confirmed' | 'rejected'

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const adminClient = createSupabaseAdminClient() as any
  const { data: rows, error } = await adminClient
    .from('presale_discoveries')
    .select(
      'id, name, region, hssply_adres, lat, lng, source_url, arch_hub_id, arch_hub_data, status, admin_notes, confirmed_at, new_listing_id, discovered_at, created_at'
    )
    .eq('status', status)
    .order('discovered_at', { ascending: false })

  if (error) {
    return (
      <div className="admin-page-content">
        <p style={{ color: 'var(--fg-danger)' }}>데이터 조회 오류: {error.message}</p>
      </div>
    )
  }

  return (
    <div className="admin-page-content">
      <h1 style={{ font: '600 20px/1.3 var(--font-sans)', marginBottom: 24 }}>
        분양 예정 단지 검수
      </h1>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--line-default)', paddingBottom: 0 }}>
        {(['pending', 'confirmed', 'rejected'] as const).map((s) => (
          <a
            key={s}
            href={`/admin/presale-discoveries?status=${s}`}
            style={{
              padding: '8px 16px',
              font: '500 14px/1 var(--font-sans)',
              color: status === s ? 'var(--brand-primary)' : 'var(--fg-secondary)',
              borderBottom: status === s ? '2px solid var(--brand-primary)' : '2px solid transparent',
              textDecoration: 'none',
              marginBottom: -1,
            }}
          >
            {s === 'pending' ? '검수 대기' : s === 'confirmed' ? '승인됨' : '거절됨'}
          </a>
        ))}
      </div>

      <PresaleDiscoveryList rows={(rows ?? []) as any} status={status} />
    </div>
  )
}
