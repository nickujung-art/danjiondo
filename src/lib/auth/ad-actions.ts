'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { Database } from '@/types/database'

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

async function requireAdmin(): Promise<{ error: string | null; admin: AdminClient | null }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다', admin: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    return { error: '관리자 권한이 필요합니다', admin: null }
  }

  return { error: null, admin: createSupabaseAdminClient() }
}

async function updateStatus(
  id: string,
  status: Database['public']['Enums']['ad_status'],
): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const { error: dbErr } = await admin
    .from('ad_campaigns')
    .update({ status })
    .eq('id', id)

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/ads')
  return { error: null }
}

export async function approveAdCampaign(id: string): Promise<{ error: string | null }> {
  return updateStatus(id, 'approved')
}

export async function rejectAdCampaign(id: string): Promise<{ error: string | null }> {
  return updateStatus(id, 'rejected')
}

export async function pauseAdCampaign(id: string): Promise<{ error: string | null }> {
  return updateStatus(id, 'paused')
}

export async function createAdCampaign(
  formData: FormData,
): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const title = formData.get('title')
  const advertiserName = formData.get('advertiser_name')
  const placement = formData.get('placement')
  const imageUrl = formData.get('image_url')
  const linkUrl = formData.get('link_url')
  const startsAt = formData.get('starts_at')
  const endsAt = formData.get('ends_at')
  const targetSggCode = formData.get('target_sgg_code')
  const targetLatRaw = formData.get('target_lat')
  const targetLngRaw = formData.get('target_lng')

  if (
    typeof title !== 'string' ||
    typeof advertiserName !== 'string' ||
    typeof placement !== 'string' ||
    typeof imageUrl !== 'string' ||
    typeof linkUrl !== 'string' ||
    typeof startsAt !== 'string' ||
    typeof endsAt !== 'string' ||
    !title.trim() ||
    !advertiserName.trim() ||
    !placement.trim() ||
    !imageUrl.trim() ||
    !linkUrl.trim() ||
    !startsAt.trim() ||
    !endsAt.trim()
  ) {
    return { error: '필수 항목을 모두 입력하세요.' }
  }

  const { error: dbErr } = await admin.from('ad_campaigns').insert({
    title: title.trim(),
    advertiser_name: advertiserName.trim(),
    placement: placement.trim(),
    image_url: imageUrl.trim(),
    link_url: linkUrl.trim(),
    starts_at: startsAt.trim(),
    ends_at: endsAt.trim(),
    status: 'pending',
    target_sgg_code: typeof targetSggCode === 'string' && targetSggCode.trim()
      ? targetSggCode.trim()
      : null,
    target_lat: typeof targetLatRaw === 'string' && targetLatRaw.trim()
      ? parseFloat(targetLatRaw.trim()) || null
      : null,
    target_lng: typeof targetLngRaw === 'string' && targetLngRaw.trim()
      ? parseFloat(targetLngRaw.trim()) || null
      : null,
  })

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/ads')
  return { error: null }
}
