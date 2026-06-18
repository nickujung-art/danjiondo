import 'server-only'
import { timingSafeEqual } from 'crypto'

/**
 * CRON_SECRET 검증 헬퍼.
 * timingSafeEqual을 사용해 타이밍 공격을 방지한다.
 * Authorization: Bearer <secret> 또는 x-cron-secret: <secret> 모두 처리.
 */
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const authHeader = request.headers.get('authorization')
  const xHeader    = request.headers.get('x-cron-secret')

  const candidate = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : xHeader ?? ''

  if (!candidate) return false

  try {
    const a = Buffer.from(candidate)
    const b = Buffer.from(secret)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
