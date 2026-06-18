'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

interface ArchHubData {
  totHoCnt?: number | null
  [key: string]: unknown
}

interface PresaleDiscoveryRow {
  id: string
  name: string
  region: string | null
  hssply_adres: string | null
  lat: number | null
  lng: number | null
  arch_hub_data: ArchHubData | null
}

async function requireAdmin(): Promise<{ error: string | null; admin: AdminClient | null }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.', admin: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !['admin', 'superadmin'].includes(profile.role ?? '')) {
    return { error: '권한이 없습니다.', admin: null }
  }

  return { error: null, admin: createSupabaseAdminClient() }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function confirmDiscovery(id: string): Promise<{ error?: string }> {
  if (!UUID_RE.test(id)) return { error: '잘못된 요청입니다.' }
  const { error: authErr, admin } = await requireAdmin()
  if (authErr || !admin) return { error: authErr! }

  const adminClient = admin as any

  const { data: discovery, error: fetchError } = await adminClient
    .from('presale_discoveries')
    .select('id, name, region, hssply_adres, lat, lng, arch_hub_data')
    .eq('id', id)
    .single()

  if (fetchError || !discovery) {
    return { error: (fetchError as { message?: string } | null)?.message ?? '데이터 조회 실패' }
  }

  const row = discovery as PresaleDiscoveryRow
  const archHubData = row.arch_hub_data as ArchHubData | null

  const { data: newListing, error: insertError } = await admin
    .from('new_listings')
    .insert({
      name: row.name,
      region: row.region,
      hssply_adres: row.hssply_adres,
      lat: row.lat,
      lng: row.lng,
      source_code: 'news_crawl',
      total_supply_count: archHubData?.totHoCnt ?? null,
      pblanc_no: null,
    } as any)
    .select('id')
    .single()

  if (insertError || !newListing) {
    return { error: insertError?.message ?? 'new_listings 등록 실패' }
  }

  const { error: updateError } = await adminClient
    .from('presale_discoveries')
    .update({
      status: 'confirmed',
      new_listing_id: (newListing as { id: string }).id,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    return { error: (updateError as { message?: string }).message }
  }

  revalidatePath('/admin/presale-discoveries')
  return {}
}

export async function rejectDiscovery(id: string): Promise<{ error?: string }> {
  if (!UUID_RE.test(id)) return { error: '잘못된 요청입니다.' }
  const { error: authErr, admin } = await requireAdmin()
  if (authErr || !admin) return { error: authErr! }

  const { error } = await (admin as any)
    .from('presale_discoveries')
    .update({ status: 'rejected' })
    .eq('id', id)

  if (error) {
    return { error: (error as { message?: string }).message }
  }

  revalidatePath('/admin/presale-discoveries')
  return {}
}

export async function updateDiscoveryNotes(
  id: string,
  notes: string
): Promise<{ error?: string }> {
  if (!UUID_RE.test(id)) return { error: '잘못된 요청입니다.' }
  const { error: authErr, admin } = await requireAdmin()
  if (authErr || !admin) return { error: authErr! }

  const { error } = await (admin as any)
    .from('presale_discoveries')
    .update({ admin_notes: notes })
    .eq('id', id)

  if (error) {
    return { error: (error as { message?: string }).message }
  }

  revalidatePath('/admin/presale-discoveries')
  return {}
}
