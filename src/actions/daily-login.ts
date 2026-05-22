'use server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function dailyLoginAction(): Promise<boolean> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .rpc('award_daily_login_points', { p_user_id: user.id })

  return data === true
}
