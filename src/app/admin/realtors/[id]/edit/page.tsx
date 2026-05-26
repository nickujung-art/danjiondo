import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getRealtorById, getAssignmentsByRealtor } from '@/lib/data/realtors'
import { RealtorEditForm } from '@/components/admin/RealtorEditForm'

export const revalidate = 0

export default async function AdminRealtorEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // 관리자 권한 확인
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/realtors/${id}/edit`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    redirect('/')
  }

  const adminClient = createSupabaseAdminClient()
  const [realtor, assignments] = await Promise.all([
    getRealtorById(id, adminClient),
    getAssignmentsByRealtor(id, adminClient),
  ])

  if (!realtor) notFound()

  // PostgREST max_rows=1000 우회: count 확인 후 동적 병렬 range 쿼리
  const { count: complexCount } = await adminClient
    .from('complexes')
    .select('*', { count: 'exact', head: true })
    .in('status', ['active', 'in_redevelopment'])

  const PAGE = 1000
  const pages = Math.ceil((complexCount ?? 0) / PAGE)
  const pageResults = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      adminClient
        .from('complexes')
        .select('id, canonical_name, si, gu')
        .in('status', ['active', 'in_redevelopment'])
        .order('canonical_name')
        .range(i * PAGE, (i + 1) * PAGE - 1),
    ),
  )
  const complexes = pageResults.flatMap(r => r.data ?? [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', fontFamily: 'var(--font-sans)' }}>
      <header
        style={{
          height: 60,
          background: '#fff',
          borderBottom: '1px solid var(--line-default)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          gap: 24,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <Link href="/" className="dj-logo">
          <span className="mark">단</span>
          <span>단지온도</span>
        </Link>
        <Link
          href="/admin/realtors"
          style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)', textDecoration: 'none' }}
        >
          ← 공인중개사 관리
        </Link>
        <span style={{ font: '600 14px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>
          공인중개사 수정
        </span>
      </header>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 32px' }}>
        <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
          {realtor.name} 수정
        </h1>
        <RealtorEditForm
          realtor={realtor}
          assignments={assignments}
          complexes={complexes ?? []}
        />
      </div>
    </div>
  )
}
