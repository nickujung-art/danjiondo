import 'server-only'
import { Resend } from 'resend'
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { shouldDeliverNow } from './generate-alerts'
import { sendAlimtalk } from '@/services/kakao-channel'

const BATCH_SIZE = 50

function initWebPush() {
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    webpush.setVapidDetails('mailto:support@danjiondo.kr', pub, priv)
    return true
  }
  return false
}

async function sendEmail(
  resend: Resend,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL ?? 'danjiondo <onboarding@resend.dev>'
  await resend.emails.send({ from, to, subject, html: `<p>${body}</p>` })
}

async function sendPushToUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  payload: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: subs } = await (supabase as any)
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('is_valid', true)

  for (const sub of subs ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = sub as any
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode === 410 || statusCode === 404) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('push_subscriptions')
          .update({ is_valid: false })
          .eq('endpoint', s.endpoint)
        continue
      }
      throw err
    }
  }
}

export async function deliverPendingNotifications(
  supabase: SupabaseClient<Database>,
): Promise<{ sent: number; failed: number }> {
  const resendKey = process.env.RESEND_API_KEY
  const resend    = resendKey ? new Resend(resendKey) : null
  const pushReady = initWebPush()

  const { data: pending } = await supabase
    .from('notifications')
    .select('id, user_id, title, body, type, data, created_at')
    .eq('status', 'pending')
    .order('created_at')
    .limit(BATCH_SIZE)

  if (!pending?.length) return { sent: 0, failed: 0 }

  let sent   = 0
  let failed = 0

  for (const n of pending) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notif = n as any
    try {
      const canSend = await shouldDeliverNow(
        notif.user_id as string,
        supabase,
        new Date(notif.created_at as string),
      )
      if (!canSend) continue

      if (pushReady) {
        const pushData: Record<string, unknown> = {
          title: notif.title,
          body:  notif.body,
        }
        const complexId = (notif.data as Record<string, unknown> | null)?.complex_id
        if (typeof complexId === 'string') {
          pushData.url = `/complex/${complexId}`
        }
        await sendPushToUser(supabase, notif.user_id as string, JSON.stringify(pushData))
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: authUser } = await (supabase as any).auth.admin.getUserById(notif.user_id)
      const email = authUser?.user?.email as string | undefined

      if (resend && email) {
        await sendEmail(resend, email, notif.title as string, notif.body as string)
      }

      await supabase
        .from('notifications')
        .update({ status: 'sent', delivered_at: new Date().toISOString() })
        .eq('id', notif.id as string)

      sent++
    } catch {
      await supabase
        .from('notifications')
        .update({ status: 'failed' })
        .eq('id', notif.id as string)
      failed++
    }
  }

  return { sent, failed }
}

/**
 * DIFF-04/05: 카카오톡 채널 알림 발송
 * kakao_channel_subscriptions의 is_active 구독자에게 pending 알림을 전달한다.
 * 등급에 따라 shouldDeliverNow로 딜레이 적용 (gold 즉시, silver/bronze 30분 딜레이).
 * T-8-04: phone_number를 로그에 절대 출력 금지.
 */
export async function deliverKakaoChannelNotifications(
  supabase: SupabaseClient<Database>,
): Promise<{ sent: number; failed: number }> {
  // database.ts는 Phase 8 마이그레이션 컬럼(kakao_channel_subscriptions)을 아직 포함하지 않음
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: subscriptions } = await (supabase as any)
    .from('kakao_channel_subscriptions')
    .select('user_id, phone_number')
    .eq('is_active', true)

  if (!subscriptions?.length) return { sent: 0, failed: 0 }

  let sent   = 0
  let failed = 0

  for (const sub of subscriptions) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscription = sub as any as { user_id: string; phone_number: string }

    // 해당 사용자의 pending 알림 조회
    const { data: pending } = await supabase
      .from('notifications')
      .select('id, title, body, type, created_at')
      .eq('user_id', subscription.user_id)
      .eq('status', 'pending')
      .order('created_at')
      .limit(10)

    for (const notif of pending ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n = notif as any as {
        id: string; title: string; body: string; type: string; created_at: string
      }

      try {
        const canSend = await shouldDeliverNow(
          subscription.user_id,
          supabase,
          new Date(n.created_at),
        )
        if (!canSend) continue

        // T-8-04: phone_number를 로그에 절대 출력 금지
        await sendAlimtalk({
          to:         subscription.phone_number,
          pfId:       process.env.KAKAO_CHANNEL_PF_ID ?? '',
          templateId: 'KA01TP_PRICE_ALERT',
          variables:  {
            '#{제목}': n.title,
            '#{내용}': n.body,
          },
        })

        await supabase
          .from('notifications')
          .update({ status: 'sent', delivered_at: new Date().toISOString() })
          .eq('id', n.id)

        sent++
      } catch {
        await supabase
          .from('notifications')
          .update({ status: 'failed' })
          .eq('id', n.id)
        failed++
      }
    }
  }

  return { sent, failed }
}
