/**
 * submitAdInquiry Server Action 테스트 — Phase 16 Plan 02
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null })
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-resend-key')
  vi.stubEnv('OPERATOR_EMAIL', 'operator@example.com')
  vi.stubEnv('RESEND_FROM_EMAIL', 'danjiondo <onboarding@resend.dev>')
  mockSend.mockClear()
})

describe('submitAdInquiry', () => {
  it('업체명 누락 → error 반환', async () => {
    const formData = new FormData()
    formData.set('contact', 'test@example.com')
    formData.set('period', '7')
    formData.set('message', '광고 문의합니다')

    const { submitAdInquiry } = await import('@/lib/auth/ad-inquiry-action')
    const result = await submitAdInquiry(formData)
    expect(result.error).toBeTruthy()
  })

  it('연락처 없음 → error 반환', async () => {
    const formData = new FormData()
    formData.set('company', '(주)테스트부동산')
    formData.set('period', '30')
    formData.set('message', '광고 문의합니다')

    const { submitAdInquiry } = await import('@/lib/auth/ad-inquiry-action')
    const result = await submitAdInquiry(formData)
    expect(result.error).toBeTruthy()
  })

  it('OPERATOR_EMAIL 미설정 → 설정 오류 반환', async () => {
    vi.stubEnv('OPERATOR_EMAIL', '')
    const formData = new FormData()
    formData.set('company', '(주)테스트부동산')
    formData.set('contact', 'test@example.com')
    formData.set('period', '7')
    formData.set('message', '광고 문의합니다')

    const { submitAdInquiry } = await import('@/lib/auth/ad-inquiry-action')
    const result = await submitAdInquiry(formData)
    expect(result.error).toBeTruthy()
    expect(result.error).toContain('수신 이메일')
  })

  it('RESEND_API_KEY 미설정 → 설정 오류 반환', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const formData = new FormData()
    formData.set('company', '(주)테스트부동산')
    formData.set('contact', 'test@example.com')
    formData.set('period', '7')
    formData.set('message', '광고 문의합니다')

    const { submitAdInquiry } = await import('@/lib/auth/ad-inquiry-action')
    const result = await submitAdInquiry(formData)
    expect(result.error).toBeTruthy()
    expect(result.error).toContain('이메일 발송')
  })

  it('유효한 입력 + 환경변수 설정 → resend.send 호출 + { error: null }', async () => {
    const formData = new FormData()
    formData.set('company', '(주)테스트부동산')
    formData.set('contact', 'test@example.com')
    formData.set('period', '30')
    formData.set('message', '홈페이지 배너 광고를 문의합니다')

    const { submitAdInquiry } = await import('@/lib/auth/ad-inquiry-action')
    const result = await submitAdInquiry(formData)
    expect(result.error).toBeNull()
    expect(mockSend).toHaveBeenCalledOnce()
    const callArgs = mockSend.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArgs?.to).toBe('operator@example.com')
    expect(String(callArgs?.subject ?? '')).toContain('광고 문의')
  })
})
