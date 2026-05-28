import { notFound } from 'next/navigation'
import Link from 'next/link'
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
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 32px' }}>
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/admin/realtors"
          style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)', textDecoration: 'none' }}
        >
          ← 공인중개사 관리
        </Link>
      </div>
      <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
        {realtor.name} 수정
      </h1>
      <RealtorEditForm
        realtor={realtor}
        assignments={assignments}
        complexes={complexes ?? []}
      />
    </div>
  )
}
