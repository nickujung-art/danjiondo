// NOTE: server-only 아님 — getTierLabel, getTierBadgeText는 클라이언트에서도 사용.
// getMemberTier는 SupabaseClient를 인자로 받으므로 서버 컴포넌트/Route에서만 호출할 것.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type MemberTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface MemberTierInfo {
  tier:   MemberTier
  points: number
}

/** D-01: 5단계 등급 한글 라벨 */
export function getTierLabel(tier: MemberTier): string {
  const labels: Record<MemberTier, string> = {
    bronze:   '브론즈',
    silver:   '실버',
    gold:     '골드',
    platinum: '플래티넘',
    diamond:  '다이아',
  }
  return labels[tier]
}

/**
 * D-06: AI 슬롭 금지 — 이모지 없이 텍스트 약자만 사용.
 * TierBadge 컴포넌트에서 배지 문자로 사용.
 */
export function getTierBadgeText(tier: MemberTier): string {
  const badges: Record<MemberTier, string> = {
    bronze:   'B',
    silver:   'S',
    gold:     'G',
    platinum: 'P',
    diamond:  'D',
  }
  return badges[tier]
}

/** D-01: 등급별 색상 토큰 (Tailwind 클래스, AI 슬롭 없음) */
export function getTierColorClass(tier: MemberTier): string {
  const colors: Record<MemberTier, string> = {
    bronze:   'text-amber-700 bg-amber-50 border-amber-200',
    silver:   'text-slate-500 bg-slate-50 border-slate-200',
    gold:     'text-yellow-600 bg-yellow-50 border-yellow-200',
    platinum: 'text-sky-600 bg-sky-50 border-sky-200',
    diamond:  'text-cyan-600 bg-cyan-50 border-cyan-200',
  }
  return colors[tier]
}

/** D-02: 등급별 알림 딜레이(ms). gold 이상은 즉시 발송. */
export function getNotificationDelay(tier: MemberTier): number {
  if (tier === 'diamond' || tier === 'platinum' || tier === 'gold') return 0
  return 30 * 60 * 1_000
}

export async function getMemberTier(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<MemberTierInfo> {
  // database.ts는 Phase 8 마이그레이션 컬럼(activity_points, member_tier)을 아직 포함하지 않음
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('profiles')
    .select('activity_points, member_tier')
    .eq('id', userId)
    .single()

  if (!data) return { tier: 'bronze', points: 0 }

  const row = data as { activity_points: number; member_tier: string }
  return {
    tier:   (row.member_tier as MemberTier) ?? 'bronze',
    points: row.activity_points ?? 0,
  }
}
