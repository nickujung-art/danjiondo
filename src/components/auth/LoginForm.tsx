'use client'

import { useState, useTransition } from 'react'
import { signInWithEmail, signInWithNaver, devSignIn } from '@/lib/auth/actions'

export function LoginForm() {
  const [email,   setEmail]   = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleEmail = () => {
    startTransition(async () => {
      const { error } = await signInWithEmail(email)
      setMessage(error ?? '이메일을 확인해주세요. 로그인 링크를 보내드렸습니다.')
    })
  }

  const handleNaver = () => {
    startTransition(async () => {
      await signInWithNaver()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Naver OAuth */}
      <button
        onClick={handleNaver}
        disabled={isPending}
        className="flex items-center justify-center gap-2 rounded-lg bg-[#03C75A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#02b350] disabled:opacity-50 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z" />
        </svg>
        네이버로 로그인
      </button>

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="flex-1 border-t border-gray-200" />
        또는
        <span className="flex-1 border-t border-gray-200" />
      </div>

      {/* Magic Link */}
      <div className="flex flex-col gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleEmail()}
          placeholder="이메일 주소"
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleEmail}
          disabled={isPending}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          이메일로 로그인 링크 받기
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.includes('보내드렸') ? 'text-green-600' : 'text-red-500'}`}>
          {message}
        </p>
      )}

      {/* 개발 모드 전용 빠른 로그인 */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-semibold text-amber-700">개발 모드 빠른 로그인</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                startTransition(async () => {
                  const res = await devSignIn('user')
                  if (res && 'error' in res) setMessage(res.error)
                })
              }}
              disabled={isPending}
              className="flex-1 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              일반 회원
            </button>
            <button
              onClick={() => {
                startTransition(async () => {
                  const res = await devSignIn('admin')
                  if (res && 'error' in res) setMessage(res.error)
                })
              }}
              disabled={isPending}
              className="flex-1 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              관리자
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
