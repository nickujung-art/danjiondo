'use server'

import { z } from 'zod'
import { Resend } from 'resend'

const inquirySchema = z.object({
  company: z.string().min(1, '업체명을 입력해 주세요').max(100, '업체명은 100자 이하로 입력해 주세요'),
  contact: z.string().min(1, '연락처를 입력해 주세요').max(200, '연락처는 200자 이하로 입력해 주세요'),
  period: z.enum(['7', '30', '90']),
  message: z
    .string()
    .min(1, '문의 내용을 입력해 주세요')
    .max(1000, '문의 내용은 1000자 이하로 입력해 주세요'),
})

const PERIOD_LABEL: Record<string, string> = {
  '7': '1주(7일)',
  '30': '1달(30일)',
  '90': '3달(90일)',
}

export async function submitAdInquiry(
  formData: FormData,
): Promise<{ error: string | null }> {
  // 1. zod 검증
  const raw = {
    company: formData.get('company') ?? '',
    contact: formData.get('contact') ?? '',
    period: formData.get('period') ?? '',
    message: formData.get('message') ?? '',
  }
  const parsed = inquirySchema.safeParse(raw)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '입력값이 유효하지 않습니다' }
  }

  // 2. 환경변수 확인
  const operatorEmail = process.env.OPERATOR_EMAIL
  if (!operatorEmail) {
    return { error: '수신 이메일이 설정되지 않았습니다. 관리자에게 문의해 주세요.' }
  }
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return { error: '이메일 발송 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.' }
  }

  // 3. Resend 이메일 발송
  const { company, contact, period, message } = parsed.data
  // HTML 이스케이프 — 운영자 메일 클라이언트 XSS 방지
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const from = process.env.RESEND_FROM_EMAIL ?? 'danjiondo <onboarding@resend.dev>'
  const subject = `[단지온도] 광고 문의 — ${esc(company)}`
  const html = `
<h2>단지온도 광고 문의</h2>
<table style="border-collapse:collapse;width:100%">
  <tr><th style="text-align:left;padding:8px;border:1px solid #e5e7eb">업체명</th><td style="padding:8px;border:1px solid #e5e7eb">${esc(company)}</td></tr>
  <tr><th style="text-align:left;padding:8px;border:1px solid #e5e7eb">연락처</th><td style="padding:8px;border:1px solid #e5e7eb">${esc(contact)}</td></tr>
  <tr><th style="text-align:left;padding:8px;border:1px solid #e5e7eb">광고 기간</th><td style="padding:8px;border:1px solid #e5e7eb">${esc(PERIOD_LABEL[period] ?? period)}</td></tr>
  <tr><th style="text-align:left;padding:8px;border:1px solid #e5e7eb">문의 내용</th><td style="padding:8px;border:1px solid #e5e7eb">${esc(message).replace(/\n/g, '<br>')}</td></tr>
</table>
<p style="color:#6b7280;font-size:12px">단지온도 광고 문의 시스템</p>
`

  const resend = new Resend(resendKey)
  try {
    const { error: sendErr } = await resend.emails.send({ from, to: operatorEmail, subject, html })
    if (sendErr) {
      return { error: `이메일 발송 실패: ${sendErr.message}` }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    return { error: `이메일 발송 중 오류가 발생했습니다: ${msg}` }
  }

  return { error: null }
}
