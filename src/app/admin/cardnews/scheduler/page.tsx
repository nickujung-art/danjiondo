import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { SchedulerPanel } from '@/components/admin/cardnews/SchedulerPanel'

export const metadata = {
  title: '카드뉴스 스케줄러 — 단지온도 관리자',
}

export default async function CardNewsSchedulerPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/cardnews/scheduler')

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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-6">카드뉴스 스케줄러</h1>
      <SchedulerPanel />
    </div>
  )
}
