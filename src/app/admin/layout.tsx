import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminSidebarDrawer } from '@/components/admin/AdminSidebarDrawer'

export const revalidate = 0

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 관리자 권한 확인
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  // 미처리 항목 카운트 병렬 조회 (서비스 롤 — RLS 우회)
  const adminClient = createSupabaseAdminClient()
  const [reportRes, adRes, gpsRes] = await Promise.all([
    adminClient
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    adminClient
      .from('ad_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    adminClient
      .from('gps_verification_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])

  const pendingCounts = {
    reports: reportRes.count ?? 0,
    ads: adRes.count ?? 0,
    gps: gpsRes.count ?? 0,
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-canvas)' }}>
      <AdminSidebar pendingCounts={pendingCounts} />
      <AdminSidebarDrawer pendingCounts={pendingCounts} />
      <main style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-sans)' }}>
        {children}
      </main>
    </div>
  )
}
