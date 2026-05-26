import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 500 * 1024 // 500KB (클라이언트에서 이미 압축했으므로 여유 있게)

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes((profile as { role: string }).role ?? '')) {
    return new Response('Forbidden', { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return new Response('Invalid form data', { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) return new Response('No file', { status: 400 })
  if (!ALLOWED_TYPES.has(file.type)) return new Response('허용되지 않는 파일 형식입니다.', { status: 400 })
  if (file.size > MAX_BYTES) return new Response('파일 크기가 500KB를 초과합니다.', { status: 400 })

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const adminClient = createSupabaseAdminClient()
  const buffer = await file.arrayBuffer()
  const { data, error } = await adminClient.storage
    .from('realtor-profiles')
    .upload(filename, buffer, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    })

  if (error) return new Response(error.message, { status: 500 })

  const { data: { publicUrl } } = adminClient.storage
    .from('realtor-profiles')
    .getPublicUrl(data.path)

  return Response.json({ url: publicUrl })
}
