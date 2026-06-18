import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { verifyCronSecret } from '@/lib/cron-auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// 이번 주 월요일 날짜 반환 (YYYY-MM-DD)
function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1) // 월요일 기준
  d.setUTCDate(diff)
  return d
}

// 8자 알파뉴메릭 코드 — crypto.randomBytes로 CSPRNG 사용 (혼동 문자 0/O, 1/I 제외)
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const weekStart = getMonday(new Date()).toISOString().slice(0, 10)

  // 이번 주 코드가 이미 존재하면 스킵 (week_start UNIQUE 제약)
  const { data: existing } = await supabase
    .from('cafe_join_codes')
    .select('code')
    .eq('week_start', weekStart)
    .single()

  if (existing) {
    return NextResponse.json({ code: existing.code, skipped: true })
  }

  const code = generateCode()
  const { data, error } = await supabase
    .from('cafe_join_codes')
    .insert({ week_start: weekStart, code })
    .select('code')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ code: data.code, skipped: false })
}
