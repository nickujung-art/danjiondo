'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { subscribeKakaoChannel } from '@/app/actions/kakao-channel-actions'

const subscribeSchema = z.object({
  phone:   z.string().regex(/^010-\d{4}-\d{4}$/, '010-XXXX-XXXX 형식으로 입력해주세요'),
  consent: z.boolean().refine(v => v === true, '개인정보 수집에 동의해야 신청할 수 있어요'),
})

type SubscribeForm = z.infer<typeof subscribeSchema>

export function KakaoChannelSubscribeForm() {
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [serverError, setServerError] = useState<string | undefined>(undefined)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SubscribeForm>({
    resolver: zodResolver(subscribeSchema),
    defaultValues: { phone: '', consent: false },
  })

  if (isSubmitted) {
    return (
      <div
        style={{
          padding:  '16px 0',
          font:     '500 13px/1.6 var(--font-sans)',
          color:    'var(--fg-sec)',
        }}
      >
        카카오톡 알림 신청이 완료되었어요.
        <br />
        알림 수신을 원하지 않으면 고객센터에 문의해주세요.
      </div>
    )
  }

  function onSubmit(data: SubscribeForm) {
    const formData = new FormData()
    formData.set('phone', data.phone)
    formData.set('consent', String(data.consent))
    setIsPending(true)
    setServerError(undefined)

    void (async () => {
      try {
        const result = await subscribeKakaoChannel(null, formData)
        if (result?.success) {
          setIsSubmitted(true)
        } else if (result?.error) {
          setServerError(result.error)
        }
      } finally {
        setIsPending(false)
      }
    })()
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <h4
        style={{
          font:        '700 13px/1.4 var(--font-sans)',
          margin:      '0 0 6px',
          color:       'var(--fg-pri)',
        }}
      >
        카카오톡 채널 알림
      </h4>
      <p
        style={{
          font:        '500 12px/1.5 var(--font-sans)',
          color:       'var(--fg-sec)',
          margin:      '0 0 16px',
        }}
      >
        웹 푸시가 차단된 경우 카카오톡으로 알림을 받을 수 있어요.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* 전화번호 인풋 */}
        <div style={{ marginBottom: 12 }}>
          <input
            {...register('phone')}
            type="tel"
            inputMode="tel"
            maxLength={13}
            autoComplete="tel"
            placeholder="010-0000-0000"
            className="input"
            aria-label="카카오톡 알림 수신 전화번호"
            style={{
              width:       '100%',
              outline:     'none',
              ...(errors.phone ? {
                borderColor: 'var(--fg-negative)',
                boxShadow:   '0 0 0 4px rgba(220,38,38,.12)',
              } : {}),
            }}
          />
          {errors.phone && (
            <p
              role="alert"
              style={{
                font:      '500 12px/1 var(--font-sans)',
                color:     'var(--fg-negative)',
                marginTop: 6,
                marginBottom: 0,
              }}
            >
              {errors.phone.message}
            </p>
          )}
        </div>

        {/* 동의 체크박스 */}
        <div
          style={{
            display:     'flex',
            alignItems:  'flex-start',
            gap:         8,
            marginBottom: 16,
          }}
        >
          <input
            {...register('consent')}
            type="checkbox"
            id="kakao-consent"
            aria-describedby={errors.consent ? 'kakao-consent-error' : undefined}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <label
            htmlFor="kakao-consent"
            style={{
              font:   '500 12px/1.5 var(--font-sans)',
              color:  'var(--fg-sec)',
              cursor: 'pointer',
            }}
          >
            <Link
              href="/legal/privacy"
              style={{
                color:          'var(--fg-brand)',
                textDecoration: 'none',
                fontWeight:     600,
              }}
            >
              [개인정보처리방침]
            </Link>
            에 따라 전화번호를 수집하는 데 동의합니다.
          </label>
        </div>
        {errors.consent && (
          <p
            id="kakao-consent-error"
            role="alert"
            style={{
              font:         '500 12px/1 var(--font-sans)',
              color:        'var(--fg-negative)',
              marginTop:    -10,
              marginBottom: 12,
            }}
          >
            {errors.consent.message}
          </p>
        )}

        {/* 서버 에러 */}
        {serverError && (
          <p
            role="alert"
            style={{
              font:         '500 12px/1 var(--font-sans)',
              color:        'var(--fg-negative)',
              marginBottom: 12,
            }}
          >
            {serverError}
          </p>
        )}

        {/* 제출 버튼 */}
        <button
          type="submit"
          disabled={isPending}
          className="btn btn-md btn-orange"
          style={{ width: '100%', height: 40 }}
        >
          {isPending ? '신청 중…' : '카카오톡 알림 신청'}
        </button>
      </form>
    </div>
  )
}
