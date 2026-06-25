import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { CardNewsBuilderClient } from '@/components/admin/cardnews/CardNewsBuilderClient'

export const metadata = {
  title: '카드뉴스 빌더 — 단지온도 관리자',
}

export default async function CardNewsBuilderPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/cardnews/builder')

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

  return <CardNewsBuilderClient />
}
