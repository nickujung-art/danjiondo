import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getAdCampaignById } from '@/lib/data/ads'
import { AdEditForm } from '@/components/admin/AdEditForm'

export const revalidate = 0

export default async function AdminAdEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const adminClient = createSupabaseAdminClient()
  const campaign = await getAdCampaignById(id, adminClient)
  if (!campaign) notFound()

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 32px' }}>
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/admin/ads"
          style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg-sec)', textDecoration: 'none' }}
        >
          ← 광고 관리
        </Link>
      </div>
      <h1 style={{ font: '700 22px/1.3 var(--font-sans)', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
        광고 수정
      </h1>
      <AdEditForm campaign={campaign} />
    </div>
  )
}
