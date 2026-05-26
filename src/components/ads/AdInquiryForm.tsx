'use client'

import { useState } from 'react'
import { submitAdInquiry } from '@/lib/auth/ad-inquiry-action'

export function AdInquiryForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await submitAdInquiry(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
      }
    } catch {
      setError('문의 제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div
        className="card"
        style={{
          padding: 32,
          textAlign: 'center',
          font: '500 15px/1.6 var(--font-sans)',
          color: 'var(--fg-positive)',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        <p style={{ margin: '0 0 8px', font: '700 16px/1.4 var(--font-sans)', color: 'var(--fg-pri)' }}>
          문의가 접수되었습니다
        </p>
        <p style={{ margin: 0, color: 'var(--fg-sec)' }}>
          영업일 기준 1–2일 내로 연락드리겠습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 28 }}>
      <form action={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div>
            <label
              htmlFor="inquiry-company"
              style={{ display: 'block', font: '600 13px/1 var(--font-sans)', marginBottom: 6 }}
            >
              업체명 <span style={{ color: 'var(--fg-negative)' }}>*</span>
            </label>
            <input
              id="inquiry-company"
              name="company"
              className="input"
              required
              style={{ width: '100%', height: 40, fontSize: 14 }}
              placeholder="중개사무소명 또는 회사명"
            />
          </div>

          <div>
            <label
              htmlFor="inquiry-contact"
              style={{ display: 'block', font: '600 13px/1 var(--font-sans)', marginBottom: 6 }}
            >
              연락처 (이메일 또는 전화번호) <span style={{ color: 'var(--fg-negative)' }}>*</span>
            </label>
            <input
              id="inquiry-contact"
              name="contact"
              className="input"
              required
              style={{ width: '100%', height: 40, fontSize: 14 }}
              placeholder="example@company.com 또는 010-0000-0000"
            />
          </div>

          <div>
            <label
              htmlFor="inquiry-period"
              style={{ display: 'block', font: '600 13px/1 var(--font-sans)', marginBottom: 6 }}
            >
              광고 기간 <span style={{ color: 'var(--fg-negative)' }}>*</span>
            </label>
            <select
              id="inquiry-period"
              name="period"
              className="input"
              required
              defaultValue="30"
              style={{ width: '100%', height: 40, fontSize: 14 }}
            >
              <option value="7">1주 (7일)</option>
              <option value="30">1달 (30일)</option>
              <option value="90">3달 (90일)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="inquiry-message"
              style={{ display: 'block', font: '600 13px/1 var(--font-sans)', marginBottom: 6 }}
            >
              문의 내용 <span style={{ color: 'var(--fg-negative)' }}>*</span>
            </label>
            <textarea
              id="inquiry-message"
              name="message"
              className="input"
              required
              rows={4}
              style={{ width: '100%', fontSize: 14, padding: '10px 12px', height: 'auto', resize: 'vertical' }}
              placeholder="광고 내용, 타겟 고객, 원하시는 게재 시작일 등을 자유롭게 적어 주세요"
            />
          </div>

          {error && (
            <p style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-negative)', margin: 0 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-md btn-orange"
              disabled={isSubmitting}
              style={{ opacity: isSubmitting ? 0.5 : 1 }}
            >
              {isSubmitting ? '제출 중...' : '문의 보내기'}
            </button>
          </div>

        </div>
      </form>
    </div>
  )
}
