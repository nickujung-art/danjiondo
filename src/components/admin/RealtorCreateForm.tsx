'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRealtor } from '@/lib/auth/realtor-actions'

export function RealtorCreateForm() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createRealtor(formData)
      if (result.error) setSubmitError(result.error)
      else router.push('/admin/realtors')
    } catch {
      setSubmitError('등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="card" style={{ padding: '28px 32px' }}>
      <form action={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

          <Field label="중개사 이름" required>
            <input
              name="name"
              className="input"
              required
              style={inputStyle}
              placeholder="홍길동"
            />
          </Field>

          <Field label="사무소명" required>
            <input
              name="agency_name"
              className="input"
              required
              style={inputStyle}
              placeholder="행복부동산"
            />
          </Field>

          <Field label="전화번호" required>
            <input
              name="phone"
              type="tel"
              className="input"
              required
              style={inputStyle}
              placeholder="055-000-0000"
            />
          </Field>

          <Field label="소개글">
            <textarea
              name="description"
              rows={4}
              className="input"
              style={{ width: '100%', fontSize: 14, resize: 'vertical', padding: '10px 12px', height: 'auto' }}
              placeholder="공인중개사 소개글 (선택)"
            />
          </Field>

          <Field label="자격번호">
            <input
              name="license_no"
              className="input"
              style={inputStyle}
              placeholder="12345678901 (선택)"
            />
          </Field>

          <Field label="프로필 이미지 URL">
            <input
              name="image_url"
              type="url"
              className="input"
              style={inputStyle}
              placeholder="https://example.com/photo.jpg (선택)"
            />
          </Field>

          {submitError && (
            <p style={{ font: '500 13px/1.4 var(--font-sans)', color: 'var(--fg-negative)', margin: 0 }}>
              {submitError}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              className="btn btn-md btn-ghost"
              onClick={() => router.push('/admin/realtors')}
              disabled={isSubmitting}
            >
              취소
            </button>
            <button
              type="submit"
              className="btn btn-md btn-orange"
              disabled={isSubmitting}
              style={{ opacity: isSubmitting ? 0.5 : 1 }}
            >
              {isSubmitting ? '등록 중…' : '공인중개사 등록'}
            </button>
          </div>

        </div>
      </form>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', height: 40, fontSize: 14 }
const labelStyle: React.CSSProperties = { font: '600 13px/1 var(--font-sans)', color: 'var(--fg-pri)' }

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <label style={labelStyle}>
          {label}
          {required && <span style={{ color: 'var(--fg-negative)', marginLeft: 2 }}>*</span>}
        </label>
        {hint && (
          <span style={{ font: '500 11px/1 var(--font-sans)', color: 'var(--fg-sec)' }}>{hint}</span>
        )}
      </div>
      {children}
    </div>
  )
}
