'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PHONE_RE = /^[0-9\-+() ]{7,20}$/

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
  if (!PHONE_RE.test(phone.trim())) {
    return { error: '전화번호 형식이 올바르지 않습니다.' }
  }

  const { error: dbErr } = await admin.from('realtors').insert({
    name: name.trim(),
    agency_name: agencyName.trim(),
    phone: phone.trim(),
    description: typeof description === 'string' && description.trim() ? description.trim() : null,
    license_no: typeof licenseNo === 'string' && licenseNo.trim() ? licenseNo.trim() : null,
    image_url: typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null,
  })

  if (dbErr) return { error: '등록 중 오류가 발생했습니다.' }
  revalidatePath('/admin/realtors')
  return { error: null }
}

export async function updateRealtor(
  id: string,
  formData: FormData,
): Promise<{ error: string | null }> {
  if (!UUID_RE.test(id)) return { error: '잘못된 요청입니다.' }

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
  if (!PHONE_RE.test(phone.trim())) {
    return { error: '전화번호 형식이 올바르지 않습니다.' }
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

  if (dbErr) return { error: '저장 중 오류가 발생했습니다.' }
  revalidatePath('/admin/realtors')
  revalidatePath(`/admin/realtors/${id}/edit`)
  return { error: null }
}

export async function deleteRealtor(id: string): Promise<{ error: string | null }> {
  if (!UUID_RE.test(id)) return { error: '잘못된 요청입니다.' }

  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const { error: dbErr } = await admin.from('realtors').delete().eq('id', id)
  if (dbErr) return { error: '삭제 중 오류가 발생했습니다.' }
  revalidatePath('/admin/realtors')
  return { error: null }
}

export async function assignRealtorToComplex(
  realtorId: string,
  complexId: string,
  displayOrder: 1 | 2,
): Promise<{ error: string | null; id: string | null }> {
  if (!UUID_RE.test(realtorId) || !UUID_RE.test(complexId)) {
    return { error: '잘못된 요청입니다.', id: null }
  }

  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error!, id: null }

  // 비활성 공인중개사 배정 차단
  const { data: realtor } = await admin
    .from('realtors')
    .select('is_active')
    .eq('id', realtorId)
    .single()
  if (!realtor?.is_active) {
    return { error: '비활성 공인중개사는 배정할 수 없습니다.', id: null }
  }

  const { data, error: dbErr } = await admin
    .from('realtor_assignments')
    .upsert(
      { realtor_id: realtorId, complex_id: complexId, display_order: displayOrder },
      { onConflict: 'complex_id,display_order' },
    )
    .select('id')
    .single()

  if (dbErr) return { error: '배정 중 오류가 발생했습니다.', id: null }
  revalidatePath('/admin/realtors')
  revalidatePath(`/complexes/${complexId}`)
  return { error: null, id: data.id }
}

export async function removeRealtorAssignment(
  assignmentId: string,
  complexId: string,
): Promise<{ error: string | null }> {
  if (!UUID_RE.test(assignmentId) || !UUID_RE.test(complexId)) {
    return { error: '잘못된 요청입니다.' }
  }

  const { error, admin } = await requireAdmin()
  if (error || !admin) return { error: error! }

  const { error: dbErr } = await admin
    .from('realtor_assignments')
    .delete()
    .eq('id', assignmentId)

  if (dbErr) return { error: '해제 중 오류가 발생했습니다.' }
  revalidatePath('/admin/realtors')
  revalidatePath(`/complexes/${complexId}`)
  return { error: null }
}
