'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

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

export async function createRealtor(
  formData: FormData,
): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const name = formData.get('name')
  const agencyName = formData.get('agency_name')
  const phone = formData.get('phone')
  const description = formData.get('description')
  const licenseNo = formData.get('license_no')
  const imageUrl = formData.get('image_url')

  if (
    typeof name !== 'string' || !name.trim() ||
    typeof agencyName !== 'string' || !agencyName.trim() ||
    typeof phone !== 'string' || !phone.trim()
  ) {
    return { error: '이름, 사무소명, 전화번호는 필수 항목입니다.' }
  }

  const { error: dbErr } = await admin.from('realtors').insert({
    name: name.trim(),
    agency_name: agencyName.trim(),
    phone: phone.trim(),
    description: typeof description === 'string' && description.trim() ? description.trim() : null,
    license_no: typeof licenseNo === 'string' && licenseNo.trim() ? licenseNo.trim() : null,
    image_url: typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null,
  })

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/realtors')
  return { error: null }
}

export async function updateRealtor(
  id: string,
  formData: FormData,
): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const name = formData.get('name')
  const agencyName = formData.get('agency_name')
  const phone = formData.get('phone')
  const description = formData.get('description')
  const licenseNo = formData.get('license_no')
  const imageUrl = formData.get('image_url')
  const isActiveRaw = formData.get('is_active')

  if (
    typeof name !== 'string' || !name.trim() ||
    typeof agencyName !== 'string' || !agencyName.trim() ||
    typeof phone !== 'string' || !phone.trim()
  ) {
    return { error: '이름, 사무소명, 전화번호는 필수 항목입니다.' }
  }

  const { error: dbErr } = await admin.from('realtors').update({
    name: name.trim(),
    agency_name: agencyName.trim(),
    phone: phone.trim(),
    description: typeof description === 'string' && description.trim() ? description.trim() : null,
    license_no: typeof licenseNo === 'string' && licenseNo.trim() ? licenseNo.trim() : null,
    image_url: typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null,
    is_active: isActiveRaw === 'true',
  }).eq('id', id)

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/realtors')
  revalidatePath(`/admin/realtors/${id}/edit`)
  return { error: null }
}

export async function deleteRealtor(id: string): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const { error: dbErr } = await admin
    .from('realtors')
    .delete()
    .eq('id', id)

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/realtors')
  return { error: null }
}

export async function assignRealtorToComplex(
  realtorId: string,
  complexId: string,
  displayOrder: 1 | 2,
): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  // UNIQUE(complex_id, display_order) 충돌 시 upsert로 교체 (Pitfall 3 방지)
  const { error: dbErr } = await admin
    .from('realtor_assignments')
    .upsert(
      { realtor_id: realtorId, complex_id: complexId, display_order: displayOrder },
      { onConflict: 'complex_id,display_order' },
    )

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/realtors')
  // 단지 상세 페이지 캐시 무효화 (revalidate=86400 ISR 우회, Pitfall 4 방지)
  revalidatePath(`/complexes/${complexId}`)
  return { error: null }
}

export async function removeRealtorAssignment(
  assignmentId: string,
  complexId: string,
): Promise<{ error: string | null }> {
  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const { error: dbErr } = await admin
    .from('realtor_assignments')
    .delete()
    .eq('id', assignmentId)

  if (dbErr) return { error: dbErr.message }
  revalidatePath('/admin/realtors')
  revalidatePath(`/complexes/${complexId}`)
  return { error: null }
}
